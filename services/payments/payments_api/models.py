import uuid

from django.db import models


class Payment(models.Model):
    class Status(models.TextChoices):
        HOLD = 'HOLD', 'HOLD'
        CAPTURED = 'CAPTURED', 'CAPTURED'
        REFUNDED = 'REFUNDED', 'REFUNDED'
        FAILED = 'FAILED', 'FAILED'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_id = models.UUIDField(db_index=True)
    user_id = models.UUIDField(db_index=True)
    amount = models.BigIntegerField()
    currency = models.CharField(max_length=8, default='RUB')
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.HOLD, db_index=True)
    provider_payment_id = models.CharField(max_length=128, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class PaymentOutbox(models.Model):
    id = models.BigAutoField(primary_key=True)
    aggregate_id = models.UUIDField(db_index=True)
    event_type = models.CharField(max_length=64)
    payload = models.JSONField(default=dict)
    published = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
