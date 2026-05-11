from rest_framework import serializers

from .models import DeliverySlot, ReturnRequest, Shipment


class DeliverySlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliverySlot
        fields = ['id', 'city', 'date', 'window_from', 'window_to', 'capacity', 'booked']


class CreateShipmentSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    user_id = serializers.UUIDField()
    slot_id = serializers.UUIDField()


class TrackingEventSerializer(serializers.Serializer):
    status = serializers.CharField(max_length=32)
    location = serializers.CharField(max_length=255, required=False, allow_blank=True)


class CreateReturnSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class ShipmentSerializer(serializers.ModelSerializer):
    slot = DeliverySlotSerializer(read_only=True)

    class Meta:
        model = Shipment
        fields = ['id', 'order_id', 'user_id', 'slot', 'tracking_number', 'status', 'events', 'created_at', 'updated_at']


class ReturnSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnRequest
        fields = ['id', 'shipment', 'reason', 'status', 'created_at']
