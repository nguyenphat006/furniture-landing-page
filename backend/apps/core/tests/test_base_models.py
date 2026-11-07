"""Base model: test qua model Sample của app test (apps.core.tests.support)."""

import pytest

from apps.accounts.tests.factories import create_user
from apps.core.tests.support.models import Sample

pytestmark = pytest.mark.django_db


def test_timestamps_and_public_id() -> None:
    obj = Sample.objects.create(name="a")
    assert obj.created_at is not None
    assert obj.updated_at >= obj.created_at
    assert obj.public_id is not None
    other = Sample.objects.create(name="b")
    assert other.public_id != obj.public_id


def test_stamp_sets_creator_once() -> None:
    alice, bob = create_user(), create_user()
    obj = Sample(name="a")
    obj.stamp(alice)
    obj.save()
    assert (obj.created_by, obj.updated_by) == (alice, alice)

    obj.stamp(bob)
    obj.save()
    obj.refresh_from_db()
    assert (obj.created_by, obj.updated_by) == (alice, bob)


def test_stamp_with_system_actor_keeps_values() -> None:
    obj = Sample(name="a")
    obj.stamp(None)
    obj.save()
    assert obj.created_by is None


def test_archive_hides_from_default_manager() -> None:
    actor = create_user()
    keep = Sample.objects.create(name="keep")
    gone = Sample.objects.create(name="gone")

    gone.archive(actor=actor)

    assert gone.is_archived
    assert gone.archived_by == actor
    assert list(Sample.objects.all()) == [keep]
    assert Sample.all_objects.count() == 2
    assert list(Sample.all_objects.archived()) == [gone]

    gone.restore()
    assert not gone.is_archived
    assert Sample.objects.count() == 2


def test_archive_is_idempotent() -> None:
    obj = Sample.objects.create(name="a")
    obj.archive(actor=None)
    first = obj.archived_at
    obj.archive(actor=None)
    assert obj.archived_at == first
