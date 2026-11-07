# CMS BFC (Django + Wagtail). Chỉ build trên server / CI, máy dev không dùng Docker (xem docs/adr/0006).
# Ghim phiên bản image chính xác giống chính sách thư viện (docs/adr/0001).

# ---------------------------------------------------------------- build: cài thư viện bằng uv
FROM python:3.12.15-slim-bookworm AS build
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --group prod

# ---------------------------------------------------------------- runtime: không có uv, chạy user thường
FROM python:3.12.15-slim-bookworm AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --home /app --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY --chown=app:app . .

# collectstatic cần settings prod nạp được: dùng giá trị giả CHỈ trong bước build, không lưu vào image
RUN DJANGO_SECRET_KEY=build-only-collectstatic-key-not-used-at-runtime-xxxxxxxxxxxx \
    DJANGO_ALLOWED_HOSTS=localhost \
    DATABASE_URL=sqlite:////tmp/build.sqlite3 \
    python manage.py collectstatic --noinput \
    && mkdir -p /app/media /app/private \
    && chown -R app:app /app/media /app/private /app/staticfiles

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4).status == 200 else 1)"]

# Migration và nhập dữ liệu chạy bằng lệnh riêng khi deploy: deploy/deploy.sh (xem deploy/README.md)
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-", "--forwarded-allow-ips", "*"]
