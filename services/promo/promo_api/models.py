from django.db import models


class PromoCode(models.Model):
    class DiscountType(models.TextChoices):
        PERCENT = 'PERCENT', 'PERCENT'
        FIXED = 'FIXED', 'FIXED'

    code = models.CharField(max_length=32, unique=True)
    discount_type = models.CharField(max_length=16, choices=DiscountType.choices)
    discount_value = models.IntegerField()
    min_order_amount = models.IntegerField(default=0)
    active = models.BooleanField(default=True)
    usage_limit = models.IntegerField(default=0)
    used_count = models.IntegerField(default=0)
