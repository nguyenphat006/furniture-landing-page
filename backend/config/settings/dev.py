"""Máy dev: SQLite, DEBUG bật, email ghi ra file trong tmp/emails."""

from config.logging import build_logging

from .base import *
from .base import BASE_DIR, LOG_LEVEL, env

DEBUG = True
# Khoá chỉ dùng ở máy dev, không bao giờ dùng cho production (prod.py bắt buộc DJANGO_SECRET_KEY).
SECRET_KEY = env.str("DJANGO_SECRET_KEY", default="dev-only-insecure-key-do-not-use-in-production")
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

EMAIL_BACKEND = "django.core.mail.backends.filebased.EmailBackend"
EMAIL_FILE_PATH = BASE_DIR / "tmp" / "emails"

# Next.js dev server (localhost:4000) mở trang preview của Wagtail
CSRF_TRUSTED_ORIGINS = ["http://localhost:4000", "http://127.0.0.1:4000"]

LOGGING = build_logging(LOG_LEVEL, json=False)
