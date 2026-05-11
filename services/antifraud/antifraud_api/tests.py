import uuid

from django.test import TestCase
from rest_framework.test import APIClient


class AntifraudApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_check(self):
        response = self.client.post('/api/v1/antifraud/check', {
            'order_id': str(uuid.uuid4()),
            'user_id': str(uuid.uuid4()),
            'amount': 350000,
            'ip': '10.1.1.1',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn(response.data['decision'], ['ALLOW', 'REVIEW', 'BLOCK'])
