from uuid import uuid4

import jwt
from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from .models import ModerationCard


def build_test_token():
    payload = {
        'sub': str(uuid4()),
        'roles': ['MODERATOR'],
    }
    if settings.JWT_ISSUER:
        payload['iss'] = settings.JWT_ISSUER
    if settings.JWT_AUDIENCE:
        payload['aud'] = settings.JWT_AUDIENCE
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


class ModerationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        token = build_test_token()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_get_next_and_approve(self):
        product_id = str(uuid4())

        enqueue = self.client.post(
            '/api/v1/product-moderation/enqueue',
            {
                'product_id': product_id,
                'event_type': 'CREATED',
                'snapshot_after': {'id': product_id, 'title': 'Demo'},
            },
            format='json',
        )
        self.assertEqual(enqueue.status_code, 201)

        next_card = self.client.post('/api/v1/product-moderation/get-next', {}, format='json')
        self.assertEqual(next_card.status_code, 200)
        self.assertEqual(next_card.data['product_id'], product_id)

        approve = self.client.post(f'/api/v1/products/{product_id}/approve', {}, format='json')
        self.assertEqual(approve.status_code, 200)
        self.assertEqual(approve.data['status'], 'MODERATED')

    def test_decline_requires_reason(self):
        product_id = str(uuid4())
        ModerationCard.objects.create(
            product_id=product_id,
            event_type='UPDATED',
            snapshot_after={'id': product_id},
        )
        decline = self.client.post(f'/api/v1/products/{product_id}/decline', {'reason_code': 'UNKNOWN'}, format='json')
        self.assertEqual(decline.status_code, 400)
