# NeoMarket OBSERVABILITY IMPLEMENTATION GUIDE

## Overview
Complete observability stack for the NeoMarket microservices platform with:
- **Distributed Tracing**: Jaeger for tracking requests across services
- **Metrics Collection**: Prometheus with OpenTelemetry instrumentation
- **Log Aggregation**: Loki for centralized logging
- **Visualization**: Grafana dashboards for real-time monitoring

## Stack Components

### 1. Jaeger (Distributed Tracing)
- **Port**: 16686 (UI), 6831 (agent UDP), 4317 (OTLP gRPC)
- **Access**: http://localhost:16686
- **Features**:
  - Traces HTTP requests across service boundaries
  - Shows latency and error propagation
  - Service dependency visualization
  - Trace sampling for high-throughput scenarios

### 2. Prometheus (Metrics)
- **Port**: 9090
- **Access**: http://localhost:9090
- **Scrape Interval**: 15s
- **Retention**: Default 15 days
- **Endpoints Scraped**:
  - All services: `http://<service>:8000/metrics`
  - Redis: Prometheus Redis exporter (optional)

### 3. Grafana (Visualization)
- **Port**: 3000
- **Default Credentials**: admin / admin
- **Access**: http://localhost:3000
- **Pre-configured Dashboards**:
  - `NeoMarket Microservices Overview`: Request rate, latency, error rate, DB queries
  - Service-specific dashboards (auto-provisioned)
- **Data Sources**:
  - Prometheus (metrics)
  - Loki (logs)
  - Jaeger (traces)

### 4. Loki (Log Aggregation)
- **Port**: 3100
- **Access**: Via Grafana Explore
- **Label**: `service=<service-name>`

## Environment Variables

All services support these observability settings in their environment:

```bash
OTEL_ENABLED=true              # Enable/disable OpenTelemetry
JAEGER_ENABLED=true            # Enable/disable Jaeger tracing
JAEGER_HOST=jaeger:6831        # Jaeger agent address
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317  # OTLP endpoint
LOG_LEVEL=DEBUG|INFO|WARNING   # Logging level
```

## Service Integration

### Automatic Instrumentation
Each service automatically instruments:

1. **Django HTTP Requests**
   - Request duration (histogram)
   - Request count (counter)
   - Error rate tracking
   - Trace context propagation

2. **Database Queries (PostgreSQL)**
   - Query count per service
   - Query duration
   - Connection pooling metrics

3. **Redis Operations**
   - Command count
   - Operation Duration
   - Connection metrics

4. **Outbound HTTP Calls**
   - External API latency
   - Error tracking
   - Trace propagation to external services

### Custom Metrics
Services can add custom metrics via the meter instance:

```python
from infra.middleware import setup_observability_from_env

observability = setup_observability_from_env('my-service')
meter = observability['meter']

# Create custom metrics
request_counter = meter.create_counter('custom.requests.processed')
request_counter.add(1, {'service': 'my-service'})
```

## Metrics Available

### By Service
- `django_http_requests_total` - Total HTTP requests
- `django_http_requests_duration_seconds` - Request duration histogram
- `django_db_execute_total` - Database queries
- `db_client_connections_usage` - Connection pool usage

### By Operation
- `redis_commands_total` - Redis command count
- `psych_execute_total` - PostgreSQL query count
- `requests_session_request_total` - Outbound HTTP call count

## Deployment

### Docker Compose
```bash
# Start all services with observability stack
docker-compose up -d

# View logs
docker-compose logs -f jaeger
docker-compose logs -f prometheus
docker-compose logs -f grafana

# Access dashboards
# - Grafana: http://localhost:3000
# - Prometheus: http://localhost:9090
# - Jaeger: http://localhost:16686
```

### Kubernetes (Production)
For K8s deployment, use OpenTelemetry Operator:

```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: OpenTelemetryCollector
metadata:
  name: otel-collector
spec:
  config: |
    receivers:
      jaeger:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
    exporters:
      prometheus:
        endpoint: "0.0.0.0:8888"
      jaeger:
        endpoint: jaeger-backend:14250
    service:
      pipelines:
        traces:
          receivers: [jaeger]
          exporters: [jaeger]
        metrics:
          receivers: [prometheus]
          exporters: [prometheus]
```

## Querying Metrics

### Prometheus Query Examples

```promql
# Request rate (req/s)
rate(django_http_requests_total[5m])

# Response time p95
histogram_quantile(0.95, rate(django_http_requests_duration_seconds_bucket[5m]))

# Error rate
rate(django_http_requests_total{status=~"5.."}[5m])

# Service CPU usage
process_resident_memory_bytes

# Active database connections
db_client_connections_usage{instance="postgres"}
```

### Grafana Loki Log Queries

```logql
# Errors in service
{service="payments"} |= "ERROR"

# Exceptions with stack traces
{service="orders"} |= "Traceback"

# New user registrations
{service="auth"} |= "user_registered"
```

## Alerting Rules

Create `infra/prometheus_rules.yml`:

```yaml
groups:
  - name: neomarket
    rules:
      - alert: HighErrorRate
        expr: rate(django_http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        annotations:
          summary: "High error rate detected"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(django_http_requests_duration_seconds_bucket[5m])) > 1
        for: 5m
        annotations:
          summary: "High request latency detected"

      - alert: DatabaseDown
        expr: pg_up == 0
        for: 1m
        annotations:
          summary: "PostgreSQL database is down"
```

## Troubleshooting

### Metrics not appearing in Prometheus
1. Check `/metrics` endpoint: `curl http://localhost:8000/metrics`
2. Verify Prometheus scrape config in `infra/prometheus.yml`
3. Check service logs: `docker-compose logs <service>`
4. Ensure OTEL_ENABLED=true in service environment

### Traces not in Jaeger
1. Verify JAEGER_ENABLED=true and JAEGER_HOST is set
2. Check Jaeger UI connectivity: http://localhost:16686
3. View service logs for OTel initialization messages
4. Ensure jaeger service is healthy: `docker-compose ps jaeger`

### Grafana dashboards not loading
1. Check datasource configuration: Grafana → Configuration → Data Sources
2. Verify Prometheus and Loki are healthy
3. Check provisioning paths in docker-compose volumes
4. Restart Grafana: `docker-compose restart grafana`

## Performance Impact

- **Tracing**: ~5-10% latency overhead (sampling reduces this)
- **Metrics**: ~1-2% overhead
- **Logging**: Depends on log level (DEBUG adds ~5% overhead)

## References

- [OpenTelemetry Python](https://opentelemetry.io/docs/instrumentation/python/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [Loki Documentation](https://grafana.com/docs/loki/latest/)

## Next Steps (Phase 2)

After validating observability layer:
1. Implement retry policies for event bus consumers
2. Setup Dead Letter Queue (DLQ) for poison messages
3. Add reprocessing logic with exponential backoff
4. Configure alerting rules in Prometheus
5. Create SLO/SLI dashboards in Grafana
