import uuid

from django.db import models


class FraudCheck(models.Model):
    class Decision(models.TextChoices):
        ALLOW = 'ALLOW', 'ALLOW'
        REVIEW = 'REVIEW', 'REVIEW'
        BLOCK = 'BLOCK', 'BLOCK'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_id = models.UUIDField(db_index=True)
    user_id = models.UUIDField(db_index=True)
    amount = models.BigIntegerField()
    score = models.IntegerField()
    decision = models.CharField(max_length=16, choices=Decision.choices)
    reasons = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
