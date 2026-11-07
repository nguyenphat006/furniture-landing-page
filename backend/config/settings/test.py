"""Chạy test: nhanh, cô lập. DATABASE_URL (Postgres trên CI) nếu có, không thì SQLite trong RAM."""

import tempfile
from pathlib import Path

from config.logging import build_logging

from .base import *
from .base import STORAGES, env

SECRET_KEY = "test-only-key"  # noqa: S105
ALLOWED_HOSTS = ["testserver", "localhost"]

DATABASES = {"default": env.db("DATABASE_URL", default="sqlite://:memory:")}

# Băm mật khẩu nhanh cho test
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

_tmp = Path(tempfile.mkdtemp(prefix="bfc-cms-test-"))
MEDIA_ROOT = _tmp / "media"
PRIVATE_MEDIA_ROOT = _tmp / "private"
STORAGES = {
    **STORAGES,
    "private": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": PRIVATE_MEDIA_ROOT, "base_url": None},
    },
}

# axes vẫn bật để test được việc khoá; tắt throttle API cho test ổn định
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}

LOGGING = build_logging("WARNING", json=False)

# App chỉ dùng cho test (model cụ thể để test base model); tạo bảng trực tiếp, không migration
INSTALLED_APPS = [*INSTALLED_APPS, "apps.core.tests.support"]
MIGRATION_MODULES = {"core_tests": None}
