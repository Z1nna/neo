import uuid
from datetime import date, time

from django.test import TestCase
from rest_framework.test import APIClient

from .models import DeliverySlot


class LogisticsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.slot = DeliverySlot.objects.create(city='Moscow', date=date.today(), window_from=time(10, 0), window_to=time(14, 0), capacity=10)

    def test_shipment_and_return_flow(self):
        shipment = self.client.post('/api/v1/logistics/shipments', {
            'order_id': str(uuid.uuid4()),
            'user_id': str(uuid.uuid4()),
            'slot_id': str(self.slot.id),
        }, format='json')
        self.assertEqual(shipment.status_code, 201)
        shipment_id = shipment.data['id']

        tracking = self.client.post(f'/api/v1/logistics/shipments/{shipment_id}/tracking', {'status': 'IN_TRANSIT', 'location': 'Sort Center'}, format='json')
        self.assertEqual(tracking.status_code, 200)

        ret = self.client.post(f'/api/v1/logistics/shipments/{shipment_id}/returns', {'reason': 'Damaged'}, format='json')
        self.assertEqual(ret.status_code, 201)
