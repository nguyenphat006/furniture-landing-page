from typing import Any, cast

import factory

from apps.accounts.models import User


class UserFactory(factory.django.DjangoModelFactory[User]):
    class Meta:
        model = User
        skip_postgeneration_save = True

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    first_name = "Test"
    last_name = "User"
    password = factory.django.Password("correct-horse-battery-staple")


def create_user(**kwargs: Any) -> User:
    """Tạo user qua factory nhưng trả đúng kiểu User (cho mypy)."""
    return cast(User, UserFactory(**kwargs))
