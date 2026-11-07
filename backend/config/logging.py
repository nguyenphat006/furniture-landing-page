"""Cấu hình log: structlog + logging chuẩn.

- Dev: log chữ có màu, dễ đọc.
- Prod: JSON một dòng mỗi sự kiện, ra stdout (Docker thu lại).
Không bao giờ log nội dung form, email, số điện thoại hay token.
"""

from typing import Any

import structlog


def build_logging(level: str, json: bool) -> dict[str, Any]:
    shared: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    structlog.configure(
        processors=[
            *shared,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    renderer: Any = structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer()
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "structlog": {
                "()": structlog.stdlib.ProcessorFormatter,
                "processor": renderer,
                "foreign_pre_chain": shared,
            },
        },
        "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "structlog"}},
        "root": {"handlers": ["console"], "level": level},
        "loggers": {
            "django": {"handlers": ["console"], "level": level, "propagate": False},
            "django_structlog": {"handlers": ["console"], "level": level, "propagate": False},
            # Tránh log câu SQL (có thể chứa dữ liệu cá nhân)
            "django.db.backends": {"handlers": ["console"], "level": "WARNING", "propagate": False},
            # Task nền của Wagtail (chỉ mục tìm kiếm / tham chiếu) chạy mỗi lần lưu: chỉ log lỗi
            "django_tasks": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        },
    }
