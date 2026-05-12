from django.test import TestCase
from rest_framework.test import APIClient


class PromoApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_create_and_apply_promo(self):
        created = self.client.post('/api/v1/promo/codes', {
            'code': 'NEW10',
            'discount_type': 'PERCENT',
            'discount_value': 10,
            'min_order_amount': 100,
        }, format='json')
        self.assertEqual(created.status_code, 201)

        applied = self.client.post('/api/v1/promo/apply', {'code': 'NEW10', 'amount': 1000}, format='json')
        self.assertEqual(applied.status_code, 200)
        self.assertTrue(applied.data['valid'])

    def test_preview_valid_without_usage_increment(self):
        preview = self.client.post('/api/v1/promo/preview/', {'code': 'WELCOME10', 'amount': 1000}, format='json')
        self.assertEqual(preview.status_code, 200)
        self.assertTrue(preview.data['valid'])
        self.assertEqual(preview.data['discount'], 100)

        preview2 = self.client.post('/api/v1/promo/preview/', {'code': 'WELCOME10', 'amount': 1000}, format='json')
        self.assertTrue(preview2.data['valid'])

        from promo_api.models import PromoCode
        promo = PromoCode.objects.get(code='WELCOME10')
        self.assertEqual(promo.used_count, 0)
