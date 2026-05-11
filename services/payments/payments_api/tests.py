import uuid

from django.test import TestCase
from rest_framework.test import APIClient


class PaymentsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_hold_capture_refund_flow(self):
        hold = self.client.post('/api/v1/payments/hold', {
            'order_id': str(uuid.uuid4()),
            'user_id': str(uuid.uuid4()),
            'amount': 10000,
            'currency': 'RUB',
        }, format='json')
        self.assertEqual(hold.status_code, 201)
        payment_id = hold.data['id']

        captured = self.client.post(f'/api/v1/payments/{payment_id}/capture', {}, format='json')
        self.assertEqual(captured.status_code, 200)

        refunded = self.client.post(f'/api/v1/payments/{payment_id}/refund', {'amount': 10000}, format='json')
        self.assertEqual(refunded.status_code, 200)
