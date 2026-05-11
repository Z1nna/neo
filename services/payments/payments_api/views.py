import json
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Payment, PaymentOutbox
from .serializers import HoldPaymentSerializer, PaymentSerializer, ProviderWebhookSerializer, RefundSerializer


def _error(code, message, http_status):
    return Response({'code': code, 'message': message}, status=http_status)


def _create_outbox(payment: Payment, event_type: str, payload: dict):
    PaymentOutbox.objects.create(
        aggregate_id=payment.id,
        event_type=event_type,
        payload={'payment_id': str(payment.id), **payload},
    )


@extend_schema_view(post=extend_schema(operation_id='payments_hold', request=HoldPaymentSerializer, responses=PaymentSerializer))
class PaymentHoldView(APIView):
    @transaction.atomic
    def post(self, request):
        serializer = HoldPaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid hold payload', status.HTTP_400_BAD_REQUEST)

        payment = Payment.objects.create(
            order_id=serializer.validated_data['order_id'],
            user_id=serializer.validated_data['user_id'],
            amount=serializer.validated_data['amount'],
            currency=serializer.validated_data.get('currency', 'RUB'),
            status=Payment.Status.HOLD,
            provider_payment_id=f'provider-{uuid4()}',
            metadata=serializer.validated_data.get('metadata', {}),
        )
        _create_outbox(payment, 'PAYMENT_HOLD_CREATED', {'order_id': str(payment.order_id), 'amount': payment.amount})
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


@extend_schema_view(get=extend_schema(operation_id='payments_get', responses=PaymentSerializer))
class PaymentDetailView(APIView):
    def get(self, request, payment_id):
        payment = Payment.objects.filter(id=payment_id).first()
        if not payment:
            return _error('NOT_FOUND', 'Payment not found', status.HTTP_404_NOT_FOUND)
        return Response(PaymentSerializer(payment).data)


@extend_schema_view(post=extend_schema(operation_id='payments_capture', responses=PaymentSerializer))
class PaymentCaptureView(APIView):
    @transaction.atomic
    def post(self, request, payment_id):
        payment = Payment.objects.select_for_update().filter(id=payment_id).first()
        if not payment:
            return _error('NOT_FOUND', 'Payment not found', status.HTTP_404_NOT_FOUND)
        if payment.status != Payment.Status.HOLD:
            return _error('BAD_REQUEST', 'Only HOLD payment can be captured', status.HTTP_400_BAD_REQUEST)

        payment.status = Payment.Status.CAPTURED
        payment.save(update_fields=['status', 'updated_at'])
        _create_outbox(payment, 'PAYMENT_CAPTURED', {'order_id': str(payment.order_id), 'amount': payment.amount})
        return Response(PaymentSerializer(payment).data)


@extend_schema_view(post=extend_schema(operation_id='payments_refund', request=RefundSerializer, responses=PaymentSerializer))
class PaymentRefundView(APIView):
    @transaction.atomic
    def post(self, request, payment_id):
        serializer = RefundSerializer(data=request.data or {})
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid refund payload', status.HTTP_400_BAD_REQUEST)

        payment = Payment.objects.select_for_update().filter(id=payment_id).first()
        if not payment:
            return _error('NOT_FOUND', 'Payment not found', status.HTTP_404_NOT_FOUND)
        if payment.status not in {Payment.Status.HOLD, Payment.Status.CAPTURED}:
            return _error('BAD_REQUEST', 'Payment cannot be refunded', status.HTTP_400_BAD_REQUEST)

        refund_amount = serializer.validated_data.get('amount', payment.amount)
        payment.status = Payment.Status.REFUNDED
        payment.metadata = {**payment.metadata, 'refund_amount': refund_amount, 'refund_reason': serializer.validated_data.get('reason', '')}
        payment.save(update_fields=['status', 'metadata', 'updated_at'])
        _create_outbox(payment, 'PAYMENT_REFUNDED', {'order_id': str(payment.order_id), 'amount': refund_amount})
        return Response(PaymentSerializer(payment).data)


@extend_schema_view(post=extend_schema(operation_id='payments_provider_webhook', request=ProviderWebhookSerializer, responses=OpenApiTypes.OBJECT))
class ProviderWebhookView(APIView):
    @transaction.atomic
    def post(self, request):
        serializer = ProviderWebhookSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid webhook payload', status.HTTP_400_BAD_REQUEST)

        payment = Payment.objects.filter(provider_payment_id=serializer.validated_data['provider_payment_id']).first()
        if not payment:
            return _error('NOT_FOUND', 'Payment not found', status.HTTP_404_NOT_FOUND)

        provider_status = serializer.validated_data['status'].upper()
        if provider_status == 'CAPTURED':
            payment.status = Payment.Status.CAPTURED
            event_type = 'PAYMENT_CAPTURED'
        elif provider_status == 'REFUNDED':
            payment.status = Payment.Status.REFUNDED
            event_type = 'PAYMENT_REFUNDED'
        elif provider_status == 'FAILED':
            payment.status = Payment.Status.FAILED
            event_type = 'PAYMENT_FAILED'
        else:
            event_type = 'PAYMENT_UPDATED'

        payment.metadata = {**payment.metadata, 'provider_webhook': serializer.validated_data.get('payload', {})}
        payment.save(update_fields=['status', 'metadata', 'updated_at'])
        _create_outbox(payment, event_type, {'order_id': str(payment.order_id), 'status': payment.status})

        return Response({'accepted': True, 'payment_id': str(payment.id), 'status': payment.status})
