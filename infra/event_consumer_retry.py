"""
Resilience framework for event bus consumers.
Provides retry policies, dead-letter queues, and poison message handling.
"""

import json
import logging
import time
from typing import Callable, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import redis
from enum import Enum

logger = logging.getLogger(__name__)


class MessageStatus(Enum):
    """Message processing status in DLQ."""
    ACTIVE = "active"
    RETRY = "retry"
    DLQ = "dlq"
    PROCESSED = "processed"


@dataclass
class RetryPolicy:
    """Configuration for exponential backoff retry strategy."""
    max_retries: int = 5
    initial_delay_ms: int = 100  # 100ms
    max_delay_ms: int = 30000    # 30s
    backoff_multiplier: float = 2.0
    jitter: bool = True

    def get_delay(self, attempt: int) -> int:
        """
        Calculate delay in milliseconds for given attempt number.
        Uses exponential backoff with optional jitter.
        """
        if attempt <= 0:
            return 0
        
        # Exponential backoff: delay = initial * multiplier ^ (attempt - 1)
        delay = min(
            self.initial_delay_ms * (self.backoff_multiplier ** (attempt - 1)),
            self.max_delay_ms
        )
        
        # Add jitter (±10% randomization)
        if self.jitter:
            import random
            jitter_range = delay * 0.1
            delay += random.uniform(-jitter_range, jitter_range)
        
        return int(delay)


class EventConsumerWithRetry:
    """
    Enhanced Redis Streams consumer with retry logic and DLQ support.
    Handles poison messages and failed event processing with exponential backoff.
    """

    # Stream names
    MAIN_STREAM = "neomarket.events"
    DLQ_STREAM = "neomarket.events.dlq"
    FAILED_STREAM = "neomarket.events.failed"
    
    # Consumer group naming convention
    CONSUMER_GROUP_FORMAT = "{source}_consumers"
    
    def __init__(
        self,
        redis_client: redis.Redis,
        service_name: str,
        source: str,
        retry_policy: Optional[RetryPolicy] = None,
    ):
        self.redis = redis_client
        self.service_name = service_name
        self.source = source
        self.retry_policy = retry_policy or RetryPolicy()
        self.consumer_group = self.CONSUMER_GROUP_FORMAT.format(source=source)
        self.consumer_name = f"{service_name}:{source}"
        
    def _ensure_consumer_group(self) -> None:
        """Create consumer group if it doesn't exist."""
        try:
            self.redis.xgroup_create(self.MAIN_STREAM, self.consumer_group, id='0', mkstream=True)
            logger.info(f"Created consumer group {self.consumer_group}")
        except redis.ResponseError as e:
            if "BUSYGROUP" in str(e):
                logger.debug(f"Consumer group {self.consumer_group} already exists")
            else:
                raise

    def _ensure_dlq_stream(self) -> None:
        """Create DLQ stream if it doesn't exist."""
        try:
            # Just try to add info; stream will be created automatically
            self.redis.xinfo_stream(self.DLQ_STREAM)
        except redis.ResponseError:
            # Stream doesn't exist; it will be created on first xadd
            pass

    def _get_retry_count(self, message_id: str) -> int:
        """Get retry count for a message from DLQ metadata."""
        try:
            metadata = self.redis.hget(f"dlq:metadata:{message_id}", "retry_count")
            return int(metadata) if metadata else 0
        except (TypeError, ValueError):
            return 0

    def _increment_retry_count(self, message_id: str) -> int:
        """Increment and return retry count for a message."""
        count = self._get_retry_count(message_id) + 1
        self.redis.hset(f"dlq:metadata:{message_id}", "retry_count", count)
        self.redis.expire(f"dlq:metadata:{message_id}", 7 * 24 * 3600)  # 7 days TTL
        return count

    def _send_to_dlq(self, message_id: str, fields: Dict[str, bytes], reason: str) -> None:
        """Send message to Dead Letter Queue."""
        dlq_fields = {
            **fields,
            b'original_message_id': message_id.encode() if isinstance(message_id, str) else message_id,
            b'dlq_timestamp': datetime.utcnow().isoformat().encode(),
            b'failure_reason': reason.encode() if isinstance(reason, str) else reason,
        }
        
        dlq_message_id = self.redis.xadd(self.DLQ_STREAM, dlq_fields)
        logger.warning(f"Message {message_id} sent to DLQ: {reason}")
        
        # Store DLQ mapping for retrieval
        self.redis.hset("dlq:mapping", message_id, dlq_message_id)

    def _schedule_retry(
        self,
        message_id: str,
        fields: Dict[str, bytes],
        attempt: int,
    ) -> None:
        """Schedule message for retry with exponential backoff."""
        delay_ms = self.retry_policy.get_delay(attempt)
        retry_at = datetime.utcnow() + timedelta(milliseconds=delay_ms)
        
        # Store message in failed stream with retry metadata
        retry_fields = {
            **fields,
            b'original_message_id': message_id.encode() if isinstance(message_id, str) else message_id,
            b'retry_attempt': str(attempt).encode(),
            b'retry_at': retry_at.isoformat().encode(),
            b'failed_timestamp': datetime.utcnow().isoformat().encode(),
        }
        
        failed_id = self.redis.xadd(self.FAILED_STREAM, retry_fields)
        logger.info(f"Message {message_id} scheduled for retry #{attempt} at {retry_at} (delay: {delay_ms}ms)")
        
        # Store in hash for tracking
        self.redis.hset(
            f"retry:metadata:{message_id}",
            mapping={
                "attempt": attempt,
                "retry_at": retry_at.isoformat(),
                "failed_stream_id": failed_id.decode() if isinstance(failed_id, bytes) else failed_id,
            }
        )

    def consume_with_retry(
        self,
        handler: Callable[[str, str, Dict], None],
        batch_size: int = 10,
        block_ms: int = 1000,
    ) -> None:
        """
        Consume messages from stream with automatic retry and DLQ support.
        
        Args:
            handler: Function(source, event_type, payload) to process message
            batch_size: Number of messages to fetch per read
            block_ms: Milliseconds to block waiting for messages
        """
        self._ensure_consumer_group()
        self._ensure_dlq_stream()
        
        logger.info(f"Starting consumer {self.consumer_name} for group {self.consumer_group}")
        
        while True:
            try:
                # Read new messages (ID '>')
                records = self.redis.xreadgroup(
                    groupname=self.consumer_group,
                    consumername=self.consumer_name,
                    streams={self.MAIN_STREAM: '>'},
                    count=batch_size,
                    block=block_ms,
                )
                
                if not records:
                    continue
                
                for _stream, messages in records:
                    for message_id, fields in messages:
                        message_id_str = message_id.decode() if isinstance(message_id, bytes) else message_id
                        self._process_message_with_retry(message_id_str, fields, handler)
                        
            except Exception as e:
                logger.error(f"Error in consume loop: {e}", exc_info=True)
                time.sleep(1)  # Backoff before retrying loop

    def _process_message_with_retry(
        self,
        message_id: str,
        fields: Dict[str, bytes],
        handler: Callable,
    ) -> None:
        """Process single message with retry logic."""
        retry_count = self._get_retry_count(message_id)
        
        try:
            # Parse message fields
            source = fields.get(b'source', b'').decode()
            event_type = fields.get(b'event_type', b'').decode()
            payload_str = fields.get(b'payload', b'{}').decode()
            payload = json.loads(payload_str)
            
            # Call handler
            handler(source, event_type, payload)
            
            # Acknowledge successful processing
            self.redis.xack(self.MAIN_STREAM, self.consumer_group, message_id)
            logger.debug(f"Message {message_id} processed successfully")
            
        except Exception as e:
            retry_count = self._increment_retry_count(message_id)
            
            if retry_count <= self.retry_policy.max_retries:
                # Schedule retry
                self._schedule_retry(message_id, fields, retry_count)
                # Still acknowledge to prevent re-reading immediately
                self.redis.xack(self.MAIN_STREAM, self.consumer_group, message_id)
            else:
                # Max retries exceeded → DLQ
                reason = f"Max retries ({self.retry_policy.max_retries}) exceeded: {str(e)}"
                self._send_to_dlq(message_id, fields, reason)
                # Acknowledge to remove from active processing
                self.redis.xack(self.MAIN_STREAM, self.consumer_group, message_id)

    def peek_dlq(self, limit: int = 100) -> list:
        """
        View messages in Dead Letter Queue without removing them.
        
        Returns:
            List of (message_id, fields) tuples
        """
        try:
            # Read range of messages
            messages = self.redis.xrange(self.DLQ_STREAM, count=limit)
            return [
                (mid.decode() if isinstance(mid, bytes) else mid, fields)
                for mid, fields in messages
            ]
        except redis.ResponseError:
            return []

    def reprocess_dlq_message(
        self,
        dlq_message_id: str,
        handler: Callable,
    ) -> bool:
        """
        Attempt to reprocess a message from DLQ.
        
        Returns:
            True if successful, False if failed
        """
        try:
            # Retrieve message from DLQ
            fields = self.redis.hgetall(dlq_message_id)
            if not fields:
                logger.warning(f"DLQ message {dlq_message_id} not found")
                return False
            
            # Extract original message ID
            original_id = fields.get(b'original_message_id', b'').decode()
            
            # Try to process
            source = fields.get(b'source', b'').decode()
            event_type = fields.get(b'event_type', b'').decode()
            payload_str = fields.get(b'payload', b'{}').decode()
            payload = json.loads(payload_str)
            
            handler(source, event_type, payload)
            
            # Remove from DLQ after successful reprocessing
            self.redis.delete(dlq_message_id)
            self.redis.hdel("dlq:mapping", original_id)
            logger.info(f"Successfully reprocessed DLQ message {dlq_message_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to reprocess DLQ message {dlq_message_id}: {e}")
            return False

    def get_dlq_stats(self) -> Dict[str, Any]:
        """Get statistics about Dead Letter Queue."""
        try:
            dlq_len = self.redis.xlen(self.DLQ_STREAM)
            failed_len = self.redis.xlen(self.FAILED_STREAM)
            
            return {
                "dlq_message_count": dlq_len,
                "failed_message_count": failed_len,
                "consumer_group": self.consumer_group,
                "consumer_name": self.consumer_name,
            }
        except redis.ResponseError:
            return {}
