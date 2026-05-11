import uuid

from django.db import models


class DeliverySlot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    city = models.CharField(max_length=120, db_index=True)
    date = models.DateField(db_index=True)
    window_from = models.TimeField()
    window_to = models.TimeField()
    capacity = models.IntegerField(default=50)
    booked = models.IntegerField(default=0)


class Shipment(models.Model):
    class Status(models.TextChoices):
        CREATED = 'CREATED', 'CREATED'
        IN_TRANSIT = 'IN_TRANSIT', 'IN_TRANSIT'
        DELIVERED = 'DELIVERED', 'DELIVERED'
        RETURNING = 'RETURNING', 'RETURNING'
        RETURNED = 'RETURNED', 'RETURNED'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_id = models.UUIDField(unique=True)
    user_id = models.UUIDField(db_index=True)
    slot = models.ForeignKey(DeliverySlot, related_name='shipments', on_delete=models.PROTECT)
    tracking_number = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.CREATED, db_index=True)
    events = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ReturnRequest(models.Model):
    class Status(models.TextChoices):
        CREATED = 'CREATED', 'CREATED'
        APPROVED = 'APPROVED', 'APPROVED'
        PICKED_UP = 'PICKED_UP', 'PICKED_UP'
        COMPLETED = 'COMPLETED', 'COMPLETED'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shipment = models.ForeignKey(Shipment, related_name='returns', on_delete=models.CASCADE)
    reason = models.CharField(max_length=255)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.CREATED)
    created_at = models.DateTimeField(auto_now_add=True)
