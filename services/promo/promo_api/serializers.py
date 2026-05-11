from rest_framework import serializers


class PromoApplySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    amount = serializers.IntegerField(min_value=0)


class PromoCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    discount_type = serializers.ChoiceField(choices=['PERCENT', 'FIXED'])
    discount_value = serializers.IntegerField(min_value=1)
    min_order_amount = serializers.IntegerField(min_value=0, required=False)
    usage_limit = serializers.IntegerField(min_value=0, required=False)
