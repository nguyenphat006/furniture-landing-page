from django.db import models

from apps.core.models import ArchivableModel, PublicIdModel, UserStampedModel


class Sample(UserStampedModel, PublicIdModel, ArchivableModel):
    name = models.CharField(max_length=50)
