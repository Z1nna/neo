from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FraudCheck
from .serializers import FraudCheckRequestSerializer, FraudRuleFeedbackSerializer


class FraudCheckView(APIView):
    def post(self, request):
        serializer = FraudCheckRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid antifraud payload'}, status=status.HTTP_400_BAD_REQUEST)

        amount = serializer.validated_data['amount']
        score = 5
        reasons = []

        if amount >= 300000:
            score += 50
            reasons.append('HIGH_AMOUNT')
        if serializer.validated_data.get('ip', '').startswith('10.'):
            score += 15
            reasons.append('SUSPICIOUS_IP_RANGE')

        if score >= 80:
            decision = FraudCheck.Decision.BLOCK
        elif score >= 50:
            decision = FraudCheck.Decision.REVIEW
        else:
            decision = FraudCheck.Decision.ALLOW

        check = FraudCheck.objects.create(
            order_id=serializer.validated_data['order_id'],
            user_id=serializer.validated_data['user_id'],
            amount=amount,
            score=score,
            decision=decision,
            reasons=reasons,
        )
        return Response({'check_id': str(check.id), 'score': score, 'decision': decision, 'reasons': reasons})


class FraudFeedbackView(APIView):
    def post(self, request):
        serializer = FraudRuleFeedbackSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid feedback payload'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'accepted': True})
