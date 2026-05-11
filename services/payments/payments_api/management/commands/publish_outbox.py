import json

import redis
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from payments_api.models import PaymentOutbox


class Command(BaseCommand):
    help = 'Publish unpublished outbox events to Redis stream'

    def handle(self, *args, **options):
        client = redis.Redis.from_url(settings.REDIS_URL)
        events = list(PaymentOutbox.objects.filter(published=False).order_by('id')[:100])
        if not events:
            self.stdout.write('No outbox events')
            return

        for event in events:
            payload = {
                'event_id': str(event.id),
                'source': settings.EVENT_SOURCE,
                'event_type': event.event_type,
                'aggregate_id': str(event.aggregate_id),
                'payload': json.dumps(event.payload),
            }
            client.xadd(settings.EVENT_STREAM, payload)
            with transaction.atomic():
                PaymentOutbox.objects.filter(id=event.id, published=False).update(published=True)

        self.stdout.write(f'Published {len(events)} events')
