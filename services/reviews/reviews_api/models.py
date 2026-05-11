import uuid

from django.db import models


class ProductReview(models.Model):
    class Status(models.TextChoices):
        PUBLISHED = 'PUBLISHED', 'PUBLISHED'
        HIDDEN = 'HIDDEN', 'HIDDEN'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product_id = models.UUIDField(db_index=True)
    user_id = models.UUIDField(db_index=True)
    rating = models.IntegerField()
    text = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PUBLISHED, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ProductQuestion(models.Model):
    class Status(models.TextChoices):
        OPEN = 'OPEN', 'OPEN'
        ANSWERED = 'ANSWERED', 'ANSWERED'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product_id = models.UUIDField(db_index=True)
    user_id = models.UUIDField(db_index=True)
    question = models.TextField()
    answer = models.TextField(blank=True)
    answered_by = models.UUIDField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
