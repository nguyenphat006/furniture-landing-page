"""Production (chạy trong Docker Compose sau Nginx HTTPS). CHƯA dùng: dự án hiện chỉ chạy local.

Fail-closed: thiếu DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS hay DATABASE_URL thì dừng khởi động.
CI chạy `manage.py check --deploy` với file này để bảo đảm cấu hình an toàn.
"""

from django.core.exceptions import ImproperlyConfigured

from config.logging import build_logging

from .base import *
from .base import MIDDLEWARE, STORAGES, env

SECRET_KEY = env.str("DJANGO_SECRET_KEY")
if len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY phải dài ít nhất 50 ký tự.")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS phải liệt kê domain cụ thể, không dùng '*'.")
DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])

# ---------------------------------------------------------------- HTTPS (Nginx kết thúc TLS)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_REDIRECT_EXEMPT = [r"^healthz$", r"^readyz$"]
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# ---------------------------------------------------------------- static (WhiteNoise, nhóm prod)
MIDDLEWARE = [
    MIDDLEWARE[0],
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[1:],
    "csp.middleware.CSPMiddleware",
]
STORAGES = {
    **STORAGES,
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# ---------------------------------------------------------------- CSP cho admin
# Bắt đầu ở chế độ report-only: admin Wagtail dùng nhiều script/style nội tuyến; siết dần khi đã
# theo dõi báo cáo vi phạm (xem docs/adr/0005).
CONTENT_SECURITY_POLICY_REPORT_ONLY = {
    "DIRECTIVES": {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "frame-ancestors": ["'self'"],
        "form-action": ["'self'"],
    },
}

# ---------------------------------------------------------------- quét virus tệp đính kèm
# Production luôn bắt buộc: tệp chưa quét sạch không tải được (docs/adr/0009)
CLAMAV_URL = env.str("CLAMAV_URL")
ATTACHMENT_SCAN_REQUIRED = True

# ---------------------------------------------------------------- email (SMTP)
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env.str("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env.str("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env.str("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = True
EMAIL_TIMEOUT = 15

LOGGING = build_logging(env.str("LOG_LEVEL", default="INFO"), json=True)

# X_FRAME_OPTIONS = SAMEORIGIN (base.py) là bắt buộc cho khung xem trước của Wagtail admin;
# trang không cho site khác nhúng (frame-ancestors 'self' trong CSP).
SILENCED_SYSTEM_CHECKS = ["security.W019"]
