from rest_framework import serializers

from .models import Order, OrderItem


class OrderItemRequestSerializer(serializers.Serializer):
    sku_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class CreateOrderRequestSerializer(serializers.Serializer):
    idempotency_key = serializers.UUIDField()
    items = OrderItemRequestSerializer(many=True, min_length=1)
    delivery_address = serializers.CharField(max_length=500, allow_blank=True, required=False)


class CancelOrderRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class UpdateOrderStatusRequestSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "id",
            "sku_id",
            "product_id",
            "product_title",
            "sku_name",
            "quantity",
            "unit_price",
            "line_total",
        ]

    unit_price = serializers.IntegerField(source="unit_price_amount", read_only=True)
    line_total = serializers.IntegerField(source="line_total_amount", read_only=True)


class OrderListItemSerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()
    total_amount = serializers.IntegerField(read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["id", "status", "total_amount", "items_count", "created_at", "updated_at"]

    def get_items_count(self, obj) -> int:
        return obj.items.count()

    def get_status(self, obj) -> str:
        return "CANCELLED" if obj.status == Order.Status.CANCELED else obj.status


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    total_amount = serializers.IntegerField(read_only=True)
    status = serializers.SerializerMethodField()
    delivery_address = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "status",
            "items",
            "total_amount",
            "delivery_address",
            "created_at",
            "updated_at",
        ]

    def get_status(self, obj) -> str:
        return "CANCELLED" if obj.status == Order.Status.CANCELED else obj.status

    def get_delivery_address(self, obj) -> str:
        return obj.delivery_address
