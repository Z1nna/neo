import json
import sys
import os

from django.conf import settings
from django.core.management.base import BaseCommand

# Add parent directory to path for infra module imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../../../'))
from infra.event_consumer_retry import EventConsumerWithRetry, RetryPolicy
from redis import Redis

from orders_api.models import IntegrationInbox, Order


class Command(BaseCommand):
    help = 'Consume cross-service events with retry logic and project state into orders domain'

    def handle(self, *args, **options):
        redis_client = Redis.from_url(settings.REDIS_URL)
        
        # Initialize consumer with retry policy
        retry_policy = RetryPolicy(
            max_retries=5,
            initial_delay_ms=200,
            max_delay_ms=30000,
            backoff_multiplier=2.0,
            jitter=True,
        )
        
        consumer = EventConsumerWithRetry(
            redis_client=redis_client,
            service_name='orders',
            source='orders-consumer',
            retry_policy=retry_policy,
        )
        
        self.stdout.write("Starting orders event consumer with retry/DLQ support")
        self.stdout.write(f"Retry policy: max_retries={retry_policy.max_retries}, initial_delay={retry_policy.initial_delay_ms}ms")
        
        # Start consuming
        consumer.consume_with_retry(
            handler=self._handle_event,
            batch_size=20,
            block_ms=5000,
        )

    def _handle_event(self, source: str, event_type: str, payload: dict):
        """Apply domain event to orders domain."""
        
        if source == 'payments' and event_type == 'PAYMENT_CAPTURED':
            order_id = payload.get('order_id')
            if order_id:
                updated = Order.objects.filter(id=order_id, status=Order.Status.PENDING).update(status=Order.Status.PAID)
                self.stdout.write(f"Order {order_id} marked as PAID")

        elif source == 'payments' and event_type in {'PAYMENT_REFUNDED', 'PAYMENT_FAILED'}:
            order_id = payload.get('order_id')
            if order_id:
                updated = Order.objects.filter(id=order_id).exclude(status=Order.Status.DELIVERED).update(status=Order.Status.CANCELED)
                self.stdout.write(f"Order {order_id} marked as CANCELED (reason: {event_type})")

        elif source == 'b2b' and event_type == 'PRODUCT_DELETED':
            product_id = payload.get('product_id')
            if product_id:
                pending_orders = Order.objects.filter(
                    status__in=[Order.Status.PENDING, Order.Status.PAID],
                    items__product_id=product_id
                ).distinct()
                for order in pending_orders:
                    order.status = Order.Status.CANCELED
                    order.cancel_reason = 'Product deleted by seller'
                    order.save(update_fields=['status', 'cancel_reason', 'updated_at'])
                    self.stdout.write(f"Order {order.id} canceled due to product deletion")
