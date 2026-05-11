import json
import sys
import os

from django.conf import settings
from django.core.management.base import BaseCommand
from redis import Redis

# Add parent directory to path for infra module imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../../../'))
from infra.event_consumer_retry import EventConsumerWithRetry, RetryPolicy

from catalog_api.models import Category, IntegrationInbox, Product


class Command(BaseCommand):
    help = 'Consume domain events with retry logic and DLQ support, projecting state into catalog read model'

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
            service_name='catalog',
            source='catalog-consumer',
            retry_policy=retry_policy,
        )
        
        self.stdout.write("Starting catalog event consumer with retry/DLQ support")
        self.stdout.write(f"Retry policy: max_retries={retry_policy.max_retries}, initial_delay={retry_policy.initial_delay_ms}ms")
        
        # Start consuming
        consumer.consume_with_retry(
            handler=self._handle_event,
            batch_size=20,
            block_ms=5000,
        )

    def _handle_event(self, source: str, event_type: str, payload: dict):
        """Apply domain event to catalog read model."""
        
        if source == 'moderation' and event_type in {'PRODUCT_APPROVED', 'PRODUCT_DECLINED'}:
            product_id = payload.get('product_id')
            if not product_id:
                return
            product = Product.objects.filter(id=product_id).first()
            if product:
                product.status = Product.Status.MODERATED if event_type == 'PRODUCT_APPROVED' else Product.Status.BLOCKED
                product.save(update_fields=['status', 'updated_at'])
                self.stdout.write(f"Updated product {product_id} status → {product.status}")

        elif source == 'b2b' and event_type in {'PRODUCT_CREATED', 'PRODUCT_UPDATED'}:
            snapshot = payload.get('snapshot_after') or {}
            category_data = snapshot.get('category') or {}
            category_id = category_data.get('id')
            if not category_id:
                return

            category, created = Category.objects.get_or_create(
                id=category_id,
                defaults={'name': category_data.get('name', 'General'), 'slug': f'cat-{str(category_id)[:8]}'},
            )
            product, created = Product.objects.update_or_create(
                id=snapshot.get('id'),
                defaults={
                    'title': snapshot.get('title', ''),
                    'description': snapshot.get('description', ''),
                    'status': snapshot.get('status', Product.Status.CREATED),
                    'category': category,
                },
            )
            action = "Created" if created else "Updated"
            self.stdout.write(f"{action} product {product.id} in catalog")
