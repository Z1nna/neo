from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DeliverySlot, ReturnRequest, Shipment
from .serializers import (
    CreateReturnSerializer,
    CreateShipmentSerializer,
    DeliverySlotSerializer,
    ReturnSerializer,
    ShipmentSerializer,
    TrackingEventSerializer,
)


def _error(code, message, http_status):
    return Response({'code': code, 'message': message}, status=http_status)


@extend_schema_view(get=extend_schema(operation_id='logistics_list_slots', responses=DeliverySlotSerializer(many=True)))
class SlotsView(APIView):
    def get(self, request):
        city = request.query_params.get('city')
        date = request.query_params.get('date')
        slots = DeliverySlot.objects.all().order_by('date', 'window_from')
        if city:
            slots = slots.filter(city__iexact=city)
        if date:
            slots = slots.filter(date=date)
        return Response(DeliverySlotSerializer(slots, many=True).data)


@extend_schema_view(
    post=extend_schema(operation_id='logistics_create_shipment', request=CreateShipmentSerializer, responses=ShipmentSerializer),
)
class ShipmentsView(APIView):
    @transaction.atomic
    def post(self, request):
        serializer = CreateShipmentSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid shipment payload', status.HTTP_400_BAD_REQUEST)

        slot = DeliverySlot.objects.select_for_update().filter(id=serializer.validated_data['slot_id']).first()
        if not slot:
            return _error('NOT_FOUND', 'Slot not found', status.HTTP_404_NOT_FOUND)
        if slot.booked >= slot.capacity:
            return _error('NO_CAPACITY', 'Slot capacity exhausted', status.HTTP_409_CONFLICT)

        slot.booked += 1
        slot.save(update_fields=['booked'])

        shipment = Shipment.objects.create(
            order_id=serializer.validated_data['order_id'],
            user_id=serializer.validated_data['user_id'],
            slot=slot,
            tracking_number=f'TRK-{timezone.now().strftime("%Y%m%d%H%M%S")}',
            status=Shipment.Status.CREATED,
            events=[{'status': 'CREATED', 'at': timezone.now().isoformat(), 'location': 'Warehouse'}],
        )
        return Response(ShipmentSerializer(shipment).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(operation_id='logistics_get_tracking', responses=ShipmentSerializer),
    post=extend_schema(operation_id='logistics_add_tracking_event', request=TrackingEventSerializer, responses=ShipmentSerializer),
)
class ShipmentTrackingView(APIView):
    def get(self, request, shipment_id):
        shipment = Shipment.objects.filter(id=shipment_id).select_related('slot').first()
        if not shipment:
            return _error('NOT_FOUND', 'Shipment not found', status.HTTP_404_NOT_FOUND)
        return Response(ShipmentSerializer(shipment).data)

    @transaction.atomic
    def post(self, request, shipment_id):
        serializer = TrackingEventSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid tracking payload', status.HTTP_400_BAD_REQUEST)

        shipment = Shipment.objects.select_for_update().filter(id=shipment_id).first()
        if not shipment:
            return _error('NOT_FOUND', 'Shipment not found', status.HTTP_404_NOT_FOUND)

        new_status = serializer.validated_data['status'].upper()
        shipment.events = [*shipment.events, {'status': new_status, 'location': serializer.validated_data.get('location', ''), 'at': timezone.now().isoformat()}]
        if new_status in Shipment.Status.values:
            shipment.status = new_status
        shipment.save(update_fields=['events', 'status', 'updated_at'])
        return Response(ShipmentSerializer(shipment).data)


@extend_schema_view(post=extend_schema(operation_id='logistics_create_return', request=CreateReturnSerializer, responses=ReturnSerializer))
class ReturnRequestView(APIView):
    @transaction.atomic
    def post(self, request, shipment_id):
        serializer = CreateReturnSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid return payload', status.HTTP_400_BAD_REQUEST)

        shipment = Shipment.objects.select_for_update().filter(id=shipment_id).first()
        if not shipment:
            return _error('NOT_FOUND', 'Shipment not found', status.HTTP_404_NOT_FOUND)

        shipment.status = Shipment.Status.RETURNING
        shipment.events = [*shipment.events, {'status': 'RETURNING', 'at': timezone.now().isoformat(), 'location': 'Customer'}]
        shipment.save(update_fields=['status', 'events', 'updated_at'])

        ret = ReturnRequest.objects.create(shipment=shipment, reason=serializer.validated_data['reason'])
        return Response(ReturnSerializer(ret).data, status=status.HTTP_201_CREATED)
