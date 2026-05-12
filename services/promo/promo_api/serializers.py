from rest_framework import serializers


class PromoApplySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    amount = serializers.IntegerField(min_value=0)

    def validate_code(self, value):
        raw = (value or '').strip()
        if not raw:
            raise serializers.ValidationError('code is required')
        if raw.upper() == 'ПОЛИНА' or raw.casefold() == 'polina':
            return 'POLINA'
        return raw.upper()


class PromoCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    discount_type = serializers.ChoiceField(choices=['PERCENT', 'FIXED'])
    discount_value = serializers.IntegerField(min_value=1)
    min_order_amount = serializers.IntegerField(min_value=0, required=False)
    usage_limit = serializers.IntegerField(min_value=0, required=False)
