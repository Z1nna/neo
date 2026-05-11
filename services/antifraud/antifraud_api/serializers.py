from rest_framework import serializers


class FraudCheckRequestSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    user_id = serializers.UUIDField()
    amount = serializers.IntegerField(min_value=1)
    ip = serializers.CharField(max_length=64, required=False)
    device_id = serializers.CharField(max_length=128, required=False)


class FraudRuleFeedbackSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    actual_fraud = serializers.BooleanField()
