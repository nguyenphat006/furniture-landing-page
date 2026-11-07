"""Dựng OpenAPI schema không truy vấn database (CI chạy spectacular trên DB trống)."""

from __future__ import annotations

from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from drf_spectacular.generators import SchemaGenerator


@pytest.mark.django_db
def test_schema_generation_runs_no_queries(settings: Any) -> None:
    with CaptureQueriesContext(connection) as ctx:
        SchemaGenerator().get_schema(request=None, public=True)
    assert [q["sql"] for q in ctx.captured_queries] == []
