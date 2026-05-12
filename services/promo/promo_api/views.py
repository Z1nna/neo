from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PromoCode
from .serializers import PromoApplySerializer, PromoCreateSerializer


def _compute_promo_discount(promo: PromoCode, amount: int) -> tuple[int, int]:
    if promo.discount_type == PromoCode.DiscountType.PERCENT:
        discount = amount * promo.discount_value // 100
    else:
        discount = promo.discount_value
    final_amount = max(0, amount - discount)
    return discount, final_amount


class PromoCodesView(APIView):
    def post(self, request):
        serializer = PromoCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid promo payload'}, status=status.HTTP_400_BAD_REQUEST)

        promo = PromoCode.objects.create(
            code=serializer.validated_data['code'].upper(),
            discount_type=serializer.validated_data['discount_type'],
            discount_value=serializer.validated_data['discount_value'],
            min_order_amount=serializer.validated_data.get('min_order_amount', 0),
            usage_limit=serializer.validated_data.get('usage_limit', 0),
        )
        return Response({'code': promo.code, 'discount_type': promo.discount_type}, status=status.HTTP_201_CREATED)


class PromoPreviewView(APIView):
    """Validate promo and return discount without consuming usage."""

    def post(self, request):
        serializer = PromoApplySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid apply payload'}, status=status.HTTP_400_BAD_REQUEST)

        code = serializer.validated_data['code']
        promo = PromoCode.objects.filter(code=code, active=True).first()
        if not promo:
            return Response({'valid': False, 'reason': 'Promo not found'})

        amount = serializer.validated_data['amount']
        if amount < promo.min_order_amount:
            return Response({'valid': False, 'reason': 'Min amount not reached'})
        if promo.usage_limit and promo.used_count >= promo.usage_limit:
            return Response({'valid': False, 'reason': 'Usage limit reached'})

        discount, final_amount = _compute_promo_discount(promo, amount)
        return Response({'valid': True, 'discount': discount, 'final_amount': final_amount, 'promo_code': promo.code})


class PromoApplyView(APIView):
    @transaction.atomic
    def post(self, request):
        serializer = PromoApplySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid apply payload'}, status=status.HTTP_400_BAD_REQUEST)

        promo = PromoCode.objects.select_for_update().filter(code=serializer.validated_data['code'], active=True).first()
        if not promo:
            return Response({'valid': False, 'reason': 'Promo not found'})

        amount = serializer.validated_data['amount']
        if amount < promo.min_order_amount:
            return Response({'valid': False, 'reason': 'Min amount not reached'})
        if promo.usage_limit and promo.used_count >= promo.usage_limit:
            return Response({'valid': False, 'reason': 'Usage limit reached'})

        discount, final_amount = _compute_promo_discount(promo, amount)

        promo.used_count += 1
        promo.save(update_fields=['used_count'])

        return Response({'valid': True, 'discount': discount, 'final_amount': final_amount, 'promo_code': promo.code})
