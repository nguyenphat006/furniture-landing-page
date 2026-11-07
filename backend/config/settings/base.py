"""Settings dùng chung cho mọi môi trường. Môi trường cụ thể: dev.py, test.py, prod.py.

Mọi giá trị có thể khác giữa các máy đọc từ biến môi trường (django-environ), xem .env.example.
Không đặt giá trị mặc định nguy hiểm ở đây: prod.py bắt buộc các biến quan trọng.
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
# File .env (nếu có) chỉ dùng ở máy dev; production truyền env qua Docker Compose.
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

# ------------------------------------------------------------------ lõi
SECRET_KEY = env.str("DJANGO_SECRET_KEY", default="")
DEBUG = False
ALLOWED_HOSTS: list[str] = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    # App của dự án đứng trước wagtail.admin để ghi đè template admin (giao diện BFC)
    "apps.core",
    "apps.accounts",
    "apps.catalog",
    "apps.inquiries",
    "apps.sitesettings",
    "apps.pages",
    # Wagtail
    "wagtail_localize",
    "wagtail_localize.locales",  # thay cho wagtail.locales
    "wagtail.contrib.forms",
    "wagtail.contrib.redirects",
    "wagtail.contrib.settings",
    "wagtail.embeds",
    "wagtail.sites",
    "wagtail.users",
    "wagtail.snippets",
    "wagtail.documents",
    "wagtail.images",
    "wagtail.search",
    "wagtail.admin",
    "wagtail",
    "modelcluster",
    "taggit",
    # Bên thứ ba
    "rest_framework",
    "drf_spectacular",
    "django_filters",
    "auditlog",
    "axes",
    # Django
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Gắn request id + user vào log
    "django_structlog.middlewares.RequestMiddleware",
    # Ghi người thực hiện (actor) cho django-auditlog
    "auditlog.middleware.AuditlogMiddleware",
    "wagtail.contrib.redirects.middleware.RedirectMiddleware",
    # django-axes phải đứng cuối
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ------------------------------------------------------------------ database
# Mặc định SQLite cho máy dev; CI và production đặt DATABASE_URL (Postgres).
DATABASES = {"default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ------------------------------------------------------------------ xác thực
AUTH_USER_MODEL = "accounts.User"

AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",  # chặn dò mật khẩu, phải đứng đầu
    "django.contrib.auth.backends.ModelBackend",
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# django-axes: khoá theo cặp tài khoản + IP sau 5 lần sai, mở lại sau 1 giờ
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = 1
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]
AXES_RESET_ON_SUCCESS = True

# ------------------------------------------------------------------ ngôn ngữ
LANGUAGE_CODE = "vi"
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = True
USE_TZ = True

LANGUAGES = [("vi", "Tiếng Việt"), ("en", "English")]
WAGTAIL_I18N_ENABLED = True
WAGTAIL_CONTENT_LANGUAGES = LANGUAGES
LOCALE_PATHS = [BASE_DIR / "locale"]

# Dịch máy (wagtail-localize): chỉ bật khi có khoá Google Cloud, xem docs/adr/0003.
if env.str("GOOGLE_CLOUD_PROJECT_ID", default=""):
    WAGTAILLOCALIZE_MACHINE_TRANSLATOR = {
        "CLASS": "wagtail_localize.machine_translators.google.GoogleCloudTranslator",
        "OPTIONS": {
            "CREDENTIALS_PATH": env.str("GOOGLE_APPLICATION_CREDENTIALS"),
            "PROJECT_ID": env.str("GOOGLE_CLOUD_PROJECT_ID"),
        },
    }

# ------------------------------------------------------------------ file tĩnh và media
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
# File đính kèm form liên hệ: KHÔNG phục vụ công khai, chỉ tải qua admin
PRIVATE_MEDIA_ROOT = BASE_DIR / "private"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "private": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": PRIVATE_MEDIA_ROOT, "base_url": None},
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# 12 MB: form Liên hệ gửi tệp tối đa 10 MB kèm các trường chữ; API cần đọc cả body để kiểm tra
# chữ ký HMAC (apps/core/api/permissions.py)
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# ------------------------------------------------------------------ Wagtail
WAGTAIL_SITE_NAME = "BFC CMS"
WAGTAILADMIN_BASE_URL = env.str("WAGTAILADMIN_BASE_URL", default="http://127.0.0.1:9000")
WAGTAILSEARCH_BACKENDS = {"default": {"BACKEND": "wagtail.search.backends.database"}}
WAGTAIL_ENABLE_UPDATE_CHECK = False
WAGTAILIMAGES_FORMAT_CONVERSIONS = {"bmp": "png", "tiff": "png"}

# ------------------------------------------------------------------ API
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.api.pagination.DefaultPagination",
    "PAGE_SIZE": 12,
    "EXCEPTION_HANDLER": "apps.core.api.exceptions.exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "600/minute"},
    "UNAUTHENTICATED_USER": None,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "BFC CMS API",
    "DESCRIPTION": "API nội bộ cho landing page BFC (Next.js gọi phía server).",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "PREPROCESSING_HOOKS": ["apps.core.api.schema.only_public_api"],
}

# ------------------------------------------------------------------ email
DEFAULT_FROM_EMAIL = env.str("DEFAULT_FROM_EMAIL", default="BFC CMS <no-reply@localhost>")

# ------------------------------------------------------------------ log (structlog)
LOG_LEVEL = env.str("LOG_LEVEL", default="INFO")
LOG_JSON = False  # prod.py bật JSON

# ------------------------------------------------------------------ bảo mật chung
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
X_FRAME_OPTIONS = "SAMEORIGIN"  # Wagtail preview cần nhúng iframe cùng nguồn
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

# Bí mật ký request server-to-server: webhook revalidate (CMS → Next) và API ghi (Next → CMS)
CMS_SHARED_SECRET = env.str("CMS_SHARED_SECRET", default="")
# Webhook làm mới cache của frontend khi xuất bản (apps/core/revalidate.py). Trống = không gọi.
FRONTEND_REVALIDATE_URL = env.str("FRONTEND_REVALIDATE_URL", default="")

# Email nhận thông báo khi có yêu cầu liên hệ mới (apps/inquiries). Trống = không gửi email,
# yêu cầu vẫn lưu và xem trong admin.
INQUIRY_NOTIFY_EMAILS: list[str] = env.list("INQUIRY_NOTIFY_EMAILS", default=[])
# Máy quét virus ClamAV cho tệp đính kèm (apps/inquiries/scanning.py), dạng tcp://host:3310.
# Trống = không quét (máy dev). Production bắt buộc (prod.py).
CLAMAV_URL = env.str("CLAMAV_URL", default="")
# True = chỉ cho tải tệp đã quét sạch. Máy dev để False để thử được khi chưa có ClamAV.
ATTACHMENT_SCAN_REQUIRED = env.bool("ATTACHMENT_SCAN_REQUIRED", default=False)
