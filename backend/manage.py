#!/usr/bin/env python
"""Lệnh quản trị Django. Mặc định dùng settings dev; CI/production đặt DJANGO_SETTINGS_MODULE."""

import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    # Console Windows mặc định cp1252: ép UTF-8 để in được tiếng Việt
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
