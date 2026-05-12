from uuid import uuid4

import json
import jwt
from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from .models import ModerationCard, ModerationEvent
from .queue import enqueue_from_event, parse_event


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
        event = ModerationEvent.objects.get(product_id=product_id)
        self.assertEqual(event.event_type, ModerationEvent.EventType.PRODUCT_APPROVED)
        self.assertTrue(event.payload['idempotency_key'])

    def test_get_next_resumes_same_moderator_in_review_card(self):
        """После get-next карточка IN_REVIEW; повторный get-next тем же модератором не должен отдавать 204."""
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

        first = self.client.post('/api/v1/product-moderation/get-next', {}, format='json')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['queue_status'], 'IN_REVIEW')
        cid = first.data['id']

        second = self.client.post('/api/v1/product-moderation/get-next', {}, format='json')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data['id'], cid)
        self.assertEqual(second.data['product_id'], product_id)

    def test_parse_event_product_id_from_aggregate_id(self):
        pid = str(uuid4())
        fields = {
            b'source': b'b2b',
            b'event_type': b'PRODUCT_UPDATED',
            b'aggregate_id': pid.encode('ascii'),
            b'payload': json.dumps(
                {
                    'event_type': 'CREATED',
                    'snapshot_after': {
                        'status': 'ON_MODERATION',
                        'skus': [{'id': str(uuid4()), 'deleted': False}],
                    },
                }
            ).encode('utf-8'),
        }
        event = parse_event(fields)
        self.assertEqual(str(event['product_id']), pid)

    def test_decline_requires_reason(self):
        product_id = str(uuid4())
        ModerationCard.objects.create(
            product_id=product_id,
            event_type='UPDATED',
            snapshot_after={'id': product_id},
        )
        decline = self.client.post(f'/api/v1/products/{product_id}/decline', {'reason_code': 'UNKNOWN'}, format='json')
        self.assertEqual(decline.status_code, 400)

    def test_stream_enqueue_refreshes_existing_open_card_and_drops_non_moderation_status(self):
        product_id = str(uuid4())
        card = ModerationCard.objects.create(
            product_id=product_id,
            event_type='CREATED',
            queue_status=ModerationCard.QueueStatus.IN_REVIEW,
            assigned_to='moderator@example.com',
            snapshot_after={'id': product_id, 'title': 'Stale', 'status': 'ON_MODERATION', 'skus': [{'id': str(uuid4())}]},
        )

        refreshed = enqueue_from_event(
            {
                'source': 'b2b',
                'product_id': product_id,
                'event_type': 'UPDATED',
                'snapshot_after': {
                    'id': product_id,
                    'title': 'Fresh snapshot',
                    'status': 'ON_MODERATION',
                    'skus': [{'id': str(uuid4()), 'deleted': False}],
                },
            }
        )
        self.assertIsNotNone(refreshed)
        self.assertEqual(refreshed.id, card.id)
        refreshed.refresh_from_db()
        self.assertEqual(refreshed.queue_status, ModerationCard.QueueStatus.PENDING)
        self.assertIsNone(refreshed.assigned_to)
        self.assertEqual(refreshed.snapshot_after['title'], 'Fresh snapshot')
        self.assertEqual(ModerationCard.objects.filter(product_id=product_id).count(), 1)

        dropped = enqueue_from_event(
            {
                'source': 'b2b',
                'product_id': product_id,
                'event_type': 'UPDATED',
                'snapshot_after': {
                    'id': product_id,
                    'title': 'Approved already',
                    'status': 'MODERATED',
                    'skus': [{'id': str(uuid4()), 'deleted': False}],
                },
            }
        )
        self.assertIsNone(dropped)
        self.assertFalse(ModerationCard.objects.filter(product_id=product_id).exists())

    def test_approve_closes_all_open_duplicates_for_same_product(self):
        product_id = str(uuid4())
        ModerationCard.objects.create(product_id=product_id, event_type='CREATED', snapshot_after={'id': product_id, 'status': 'ON_MODERATION', 'skus': [{'id': str(uuid4())}]})
        ModerationCard.objects.create(product_id=product_id, event_type='UPDATED', snapshot_after={'id': product_id, 'status': 'ON_MODERATION', 'skus': [{'id': str(uuid4())}]})

        approve = self.client.post(f'/api/v1/products/{product_id}/approve', {}, format='json')
        self.assertEqual(approve.status_code, 200)
        self.assertEqual(
            ModerationCard.objects.filter(product_id=product_id, queue_status=ModerationCard.QueueStatus.APPROVED).count(),
            2,
        )
