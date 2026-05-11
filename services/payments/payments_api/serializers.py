from rest_framework import serializers

from .models import Payment


class HoldPaymentSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    user_id = serializers.UUIDField()
    amount = serializers.IntegerField(min_value=1)
    currency = serializers.CharField(max_length=8, default='RUB')
    metadata = serializers.DictField(required=False)


class RefundSerializer(serializers.Serializer):
    amount = serializers.IntegerField(min_value=1, required=False)
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)


class ProviderWebhookSerializer(serializers.Serializer):
    provider_payment_id = serializers.CharField(max_length=128)
    status = serializers.CharField(max_length=32)
    payload = serializers.DictField(required=False)


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'order_id', 'user_id', 'amount', 'currency', 'status', 'provider_payment_id', 'metadata', 'created_at', 'updated_at']
