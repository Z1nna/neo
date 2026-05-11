# NeoMarket RESILIENCE & RETRY STRATEGY

## Overview
Complete resilience implementation for event bus with:
- **Exponential Backoff Retry**: Automatic retry with configurable backoff strategy
- **Dead Letter Queue (DLQ)**: Capture permanently failed messages for inspection and reprocessing
- **Poison Message Detection**: Prevent infinite loop on unparseable messages
- **Failed Stream Tracking**: Monitor pending retry messages
- **CLI Tools**: Inspect and reprocess DLQ messages

## Architecture

### Event Streams
```
neomarket.events  ──(consumer)──> Handler
    │
    └─(failure)─> neomarket.events.failed ──(reprocess loop)──> retry
    │
    └─(max retries exceeded)──> neomarket.events.dlq ──(manual inspection)
```

### Retry Mechanism

**Default Policy**:
- Initial delay: 200ms
- Max retries: 5
- Max delay: 30 seconds
- Backoff multiplier: 2.0x (exponential)
- Jitter: ±10% random variance

**Backoff Sequence** (example):
1. Immediate attempt (0ms)
2. Retry after 200ms (failure #1)
3. Retry after 400ms (failure #2)
4. Retry after 800ms (failure #3)
5. Retry after 1600ms (failure #4)
6. Retry after 3200ms (failure #5)
7. → DLQ (exceeded max retries)

**Configuration** (environment or code):
```python
from infra.event_consumer_retry import RetryPolicy

policy = RetryPolicy(
    max_retries=5,                # Maximum retry attempts
    initial_delay_ms=200,         # Start delay in milliseconds
    max_delay_ms=30000,           # Cap delay at 30s
    backoff_multiplier=2.0,       # 2x growth per retry
    jitter=True,                  # Add randomness to prevent thundering herd
)
```

## Using Event Consumer with Retry

### Basic Usage

```python
from infra.event_consumer_retry import EventConsumerWithRetry, RetryPolicy
from redis import Redis

# Setup
redis_client = Redis.from_url('redis://localhost:6379/0')
retry_policy = RetryPolicy(max_retries=5)

consumer = EventConsumerWithRetry(
    redis_client=redis_client,
    service_name='my-service',
    source='my-consumer',
    retry_policy=retry_policy,
)

# Define handler
def my_handler(source: str, event_type: str, payload: dict):
    # Process event
    print(f"Processing {event_type} from {source}")
    # Exceptions are caught and retried automatically

# Run consumer
consumer.consume_with_retry(
    handler=my_handler,
    batch_size=20,  # Messages per read
    block_ms=5000,  # Redis blocking timeout
)
```

### Custom Retry Policy

```python
# Shorter delays for fast failures
fast_retry = RetryPolicy(
    max_retries=3,
    initial_delay_ms=50,
    max_delay_ms=5000,
    backoff_multiplier=3.0,
)

consumer = EventConsumerWithRetry(
    redis_client=redis_client,
    service_name='payments',
    source='payments-consumer',
    retry_policy=fast_retry,
)
```

## DLQ Management

### List DLQ Messages

```bash
# List first 100 DLQ messages with details
python manage.py dlq_manage list --limit 100
```

Output:
```
=== DLQ Statistics ===
Total messages in DLQ: 45
Total messages in FAILED stream: 12

=== First 45 Messages in DLQ ===

1. Message ID: 1234567890-0
   source: payments
   event_type: PAYMENT_CAPTURED
   original_message_id: 1234567890-0
   dlq_timestamp: 2024-01-15T10:30:42.123456
   failure_reason: 'Cannot find order ID 999 in database'
```

### Inspect Specific Message

```bash
# Get full details of a DLQ message
python manage.py dlq_manage inspect --message-id 1234567890-0
```

Output:
```
=== DLQ Message Details ===
Message ID: 1234567890-0
source: payments
event_type: PAYMENT_CAPTURED
payload: {"order_id": "999", "amount": 5000}
...

=== Retry Metadata ===
retry_count: 5
failed_timestamps: [...]
```

### Reprocess DLQ Message

```bash
# Manually reprocess a message from DLQ
python manage.py dlq_manage reprocess --message-id 1234567890-0
```

Outcomes:
- ✓ Success: Message removed from DLQ
- ✗ Failure: Message stays in DLQ for manual review

### Clear DLQ

```bash
# WARNING: Delete all messages
python manage.py dlq_manage clear

Type 'yes' to confirm: yes
```

## Monitoring & Observability

### Metrics Available

**Prometheus Metrics** (via OpenTelemetry):
```promql
# Consumer group lag
redis_stream_consumer_pending

# Messages in FAILED stream
redis_stream_length{stream="neomarket.events.failed"}

# Messages in DLQ
redis_stream_length{stream="neomarket.events.dlq"}

# Retry rate
rate(event_retry_attempts_total[5m])

# DLQ inbox rate
rate(event_dlq_inbox_total[5m])
```

### Grafana Dashboard Queries

```javascript
// Retry rate by error type
rate(event_retry_attempts_total[5m]) by (error_type)

// DLQ growth over time
redis_stream_length{stream="neomarket.events.dlq"}

// Consumer lag
histogram_quantile(0.95, rate(redis_stream_consumer_pending_bucket[5m]))
```

### Alerting

```yaml
groups:
  - name: resilience
    rules:
      - alert: HighDLQSize
        expr: redis_stream_length{stream="neomarket.events.dlq"} > 100
        for: 5m
        annotations:
          summary: "High number of messages in DLQ ({{ $value }})"

      - alert: HighRetryRate
        expr: rate(event_retry_attempts_total[5m]) > 1
        for: 2m
        annotations:
          summary: "High event retry rate: {{ $value }} retries/sec"

      - alert: ConsumerLag
        expr: redis_stream_consumer_pending > 1000
        for: 10m
        annotations:
          summary: "Consumer lag exceeds 1000 messages"
```

## Best Practices

### 1. Idempotent Handlers

Handlers should be idempotent (safe to apply multiple times):

```python
# ✓ GOOD: Idempotent update
def handle_payment_captured(source, event_type, payload):
    order_id = payload['order_id']
    Order.objects.filter(
        id=order_id,
        status=Order.Status.PENDING
    ).update(status=Order.Status.PAID)
    # Safe to call multiple times; updates only if status matches

# ✗ BAD: Non-idempotent increment
def handle_payment_captured(source, event_type, payload):
    order = Order.objects.get(id=payload['order_id'])
    order.total_paid += payload['amount']  # Will double on retry!
    order.save()
```

### 2. Fail Fast on Unrecoverable Errors

```python
def handle_event(source, event_type, payload):
    # Bad: Don't catch all exceptions
    try:
        process_event(payload)
    except Exception:
        pass  # Silent failure
    
    # Good: Distinguish recoverable vs permanent errors
    try:
        validate_payload(payload)  # Raises ValueError if invalid
        process_event(payload)
    except ValueError as e:
        # Permanent error: invalid payload
        logger.error(f"Invalid event: {e}")
        raise  # This will go to DLQ after max retries
    except ConnectionError as e:
        # Transient error: network issue
        logger.warning(f"Connection error: {e}")
        raise  # This will retry automatically
```

### 3. Monitor DLQ Growth

Set up alerting on DLQ size:

```python
# In monitoring script
dlq_size = consumer.get_dlq_stats()['dlq_message_count']
if dlq_size > threshold:
    alert_ops_team(f"DLQ has {dlq_size} messages")
```

### 4. Regular DLQ Inspection

```bash
# Daily inspection job
0 2 * * * /opt/neomarket/inspect_dlq.sh

# Script: inspect_dlq.sh
#!/bin/bash
python manage.py dlq_manage list --limit 50 | grep failure_reason | tail -20
```

## Troubleshooting

### Messages Stuck in Retry Loop
- Check handler for exceptions being raised
- Verify idempotency of handler
- Review last failure reason in DLQ metadata

### Too Many DLQ Messages
1. Review failure reasons
2. Reprocess if external dependency was down
3. Fix underlying issue in handler
4. Alert on sustained high DLQ growth

### Consumer Not Processing Messages
- Verify consumer is running: `ps aux | grep consume_domain_events`
- Check Redis connectivity: `redis-cli ping`
- View logs for consumer group creation errors
- Ensure consumer group exists: `redis-cli xinfo groups neomarket.events`

## Performance Characteristics

### Latency Impact
- Basic consumer: ~50ms per message
- With retry framework: +10ms (metadata updates)
- With tracing: +5-10ms (conditional)

### Throughput
- Single consumer: ~100-200 msg/sec (typical)
- Multi-instance: Linear scaling up to Redis network limit

### Memory Usage
- Retry metadata (per message): ~200 bytes
- DLQ storage (per message): ~1KB
- With 10K DLQ messages: ~10MB Redis memory

## References
- [Redis Streams Documentation](https://redis.io/docs/data-types/streams/)
- [Exponential Backoff](https://en.wikipedia.org/wiki/Exponential_backoff)
- [Event Sourcing Patterns](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Dead Letter Queue Pattern](https://en.wikipedia.org/wiki/Dead_letter_queue)
