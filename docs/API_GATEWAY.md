# NeoMarket API GATEWAY DOCUMENTATION

## Overview
Centralized API Gateway providing:
- **Request Routing**: Intelligent routing to microservices
- **Rate Limiting**: Per-user, per-IP, and per-endpoint rate limiting
- **Authentication**: Unified JWT validation (delegated to services)
- **Security Headers**: Protection against common web attacks
- **Request Tracking**: Unique request IDs for distributed tracing
- **Performance**: Sub-millisecond routing with load balancing

## Architecture

```
Client Requests
    ↓
[API Gateway - Nginx] ← Rate Limiting, Auth Headers, Routing
    ├─→ [Auth Service] ← /api/v1/auth/*
    ├─→ [B2B Service] ← /api/v1/b2b/* (requires auth)
    ├─→ [Payments Service] ← /api/v1/payments/* (requires auth)
    ├─→ [Orders Service] ← /api/v1/orders/*
    ├─→ [Catalog Service] ← /api/v1/catalog/* (public)
    ├─→ [Cart Service] ← /api/v1/cart/*
    └─→ [Reviews Service] ← /api/v1/reviews/* (public)
```

## Endpoints

### Public Endpoints (No Rate Limit Auth Required)

| Endpoint | Service | Rate Limit | Purpose |
|----------|---------|-----------|---------|
| `/api/v1/catalog/*` | Catalog | 10 req/s per IP | Product browsing |
| `/api/v1/reviews/*` | Reviews | 10 req/s per IP | View reviews |
| `/api/v1/auth/login` | Auth | 5 req/s per IP | User authentication |
| `/api/v1/auth/register` | Auth | 5 req/s per IP | User registration |

### Authenticated Endpoints (Requires Authorization Header)

| Endpoint | Service | Rate Limit | Purpose |
|----------|---------|-----------|---------|
| `/api/v1/orders/*` | Orders | 100 req/s per user | Order management |
| `/api/v1/cart/*` | Cart | 100 req/s per user | Shopping cart |
| `/api/v1/payments/*` | Payments | 20 req/s per IP | Payment processing |
| `/api/v1/b2b/*` | B2B | 50 req/s per seller | Seller cabinet |
| `/api/v1/logistics/*` | Logistics | 30 req/s per user | Delivery management |
| `/api/v1/promo/*` | Promo | 100 req/s per user | Discount codes |

### Admin Endpoints (Blocked)

| Endpoint | Response |
|----------|----------|
| `/admin` | 403 Forbidden |
| `/admin/*` | 403 Forbidden |

## Rate Limiting Zones

### Zone Definitions

```nginx
# By IP address (general public traffic)
limit_req_zone $binary_remote_addr zone=ip_general:10m rate=10r/s;
max burst: 20 requests

# By IP address (strict - auth endpoints)
limit_req_zone $binary_remote_addr zone=ip_strict:10m rate=2r/s;
max burst: 5 requests

# By User ID (authenticated requests)
limit_req_zone $http_x_user_id zone=user_general:10m rate=100r/s;

# By Seller ID (B2B sellers)
limit_req_zone $http_x_seller_id zone=seller_general:10m rate=50r/s;

# Auth endpoints
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;

# Payments endpoints
limit_req_zone $binary_remote_addr zone=payment_limit:10m rate=20r/s;
```

## Rate Limit Headers

All responses include rate limit headers:

```http
X-RateLimit-Limit: 100        # Requests allowed in window
X-RateLimit-Remaining: 95     # Requests remaining
X-RateLimit-Reset: 1705334800 # Unix timestamp when limit resets
```

## Request Flow

### 1. Request Arrives at Gateway

```bash
curl -H "Authorization: Bearer TOKEN" \
     -H "X-User-ID: user-123" \
     http://localhost:8888/api/v1/orders/
```

### 2. Gateway Processing

```
Step 1: Rate limit check
        - Extract identifier (IP, User-ID, etc.)
        - Check zone limit
        - If exceed: respond 429 Too Many Requests
        - If OK: add X-RateLimit-* headers

Step 2: Add headers
        - X-Real-IP: original client IP
        - X-Forwarded-For: proxy chain
        - X-Forwarded-Proto: https
        - X-Request-ID: unique request UUID

Step 3: Route to service
        - Match endpoint pattern
        - Load balance to healthy backend
        - Forward request with headers

Step 4: Receive response
        - Add security headers
        - Compress if applicable
        - Return to client
```

### 3. Example Request Lifecycle

```
Client: POST /api/v1/orders/ with Bearer token
  ↓
Gateway: Rate limit check (user_general zone)
  ↓ (if OK)
Gateway: Add X-Request-ID, X-User-ID headers
  ↓
Gateway: Route to orders_backend (http://orders:8000)
  ↓
Orders Service: Process request with JWT validation
  ↓
Orders Service: Return 200 with order data
  ↓
Gateway: Add security headers (X-Frame-Options, etc.)
  ↓
Gateway: Return response to client with rate limit headers
```

## Rate Limit Behavior

### Default Behavior
- **Burst**: Allows burst queue of requests up to burst limit
- **Nodelay**: Immediately start delaying requests over limit
- **Zone Share**: Multiple connections from same IP/User share the zone

### Example: User Sends 120 Requests in 10 Seconds

```
Zone: user_general (100 req/s, burst=50)

Time 0s: Request 1-50 → OK (burst queue)
Time 0s: Request 51-100 → OK (burst queue filled)
Time 0s: Request 101-120 → 429 Too Many Requests (burst exceeded)

After 1s: ~100 new available
Time 1s: Retry requests 101-120 → OK

Result: Requests must be spread over time to succeed
```

## Security Features

### CORS & Origin Protection
```nginx
add_header Access-Control-Allow-Origin "*" always;
add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
```

### Prevent Frame Embedding
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
```

### Prevent MIME Type Sniffing
```nginx
add_header X-Content-Type-Options "nosniff" always;
```

### XSS Protection
```nginx
add_header X-XSS-Protection "1; mode=block" always;
```

### Content Security Policy
```nginx
add_header Content-Security-Policy "default-src 'self'" always;
```

## Load Balancing

### Algorithm: Least Connections
Each upstream uses `least_conn` directive:
```nginx
upstream payments_backend {
    least_conn;
    server payments:8000 max_fails=3 fail_timeout=30s;
}
```

### Health Checks
- **Max fails**: 3 consecutive failures
- **Fail timeout**: 30 seconds before retry
- **Automatic recovery**: Failed backends automatically re-enabled

## Request Timeouts

| Service | Connect | Send | Read |
|---------|---------|------|------|
| Auth | 5s | 10s | 10s |
| B2B | 5s | 15s | 15s |
| Payments | 5s | 20s | 20s |
| Orders | 5s | 15s | 15s |
| Cart | 5s | 10s | 10s |
| Catalog | 3s | 10s | 10s |
| Logistics | 5s | 15s | 15s |

**Note**: If service doesn't respond in time, gateway returns 504 Gateway Timeout

## Logging

### Access Log Format
```
192.168.1.100 - - [15/Jan/2024:10:30:42 +0000]
"POST /api/v1/orders/ HTTP/1.1" 201 512
"-" "curl/7.81.0"
rt=0.125 uct="0.005" uht="0.020" urt="0.100"
```

- `rt`: Total request time (125ms)
- `uct`: Upstream connect time (5ms)
- `uht`: Upstream header time (20ms)
- `urt`: Upstream response time (100ms)

## Monitoring & Alerts

### Prometheus Metrics (via Nginx Exporter)
```promql
# Request rate by endpoint
rate(nginx_requests_total[5m])

# Error rate
rate(nginx_requests_total{status=~"5.."}[5m])

# P95 latency
histogram_quantile(0.95, rate(nginx_request_duration_seconds_bucket[5m]))

# Active connections
nginx_connections_active

# Rate limit hits
rate(nginx_ratelimit_status_total{status="429"}[5m])
```

### Alert Rules

```yaml
alerts:
  - alert: HighGatewayErrorRate
    expr: rate(nginx_requests_total{status=~"5.."}[5m]) > 0.1
    annotations:
      summary: "Gateway error rate > 10% ({{ $value }})"

  - alert: HighRateLimitHits
    expr: rate(nginx_ratelimit_status_total{status="429"}[5m]) > 1
    annotations:
      summary: "More than 1 rate limit hit/sec"

  - alert: GatewayHighLatency
    expr: histogram_quantile(0.95, rate(nginx_request_duration_seconds_bucket[5m])) > 1
    annotations:
      summary: "P95 latency > 1 second"
```

## Deployment

### Docker Compose
```bash
# Start with API Gateway
docker-compose up -d api_gateway

# View logs
docker-compose logs -f api_gateway

# Check health
curl http://localhost:8888/health
```

### Kubernetes

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
spec:
  ports:
    - port: 80
      targetPort: 80
  selector:
    app: api-gateway
  type: LoadBalancer
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3  # High availability
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: nginx
        image: neomarket/api-gateway:latest
        ports:
        - containerPort: 80
        livenessProbe:
          httpGet:
            path: /health
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 5
```

## Troubleshooting

### 429 Too Many Requests

**Cause**: Hit rate limit
```bash
# Check current rate limit
curl -IH "X-User-ID: user-123" http://localhost:8888/api/v1/orders/
# Look for X-RateLimit-* headers

# Identify rate limit zone:
# user_general: 100 req/s per user
# ip_general: 10 req/s per IP
# seller_general: 50 req/s per seller
```

**Solution**:
1. Spread requests over time (implement backoff in client)
2. Request higher limit if legitimate use case
3. Use user/seller ID instead of IP (higher limits)

### 504 Gateway Timeout

**Cause**: Service taking too long to respond
```bash
# Check service health
docker-compose ps <service>

# Check service logs
docker-compose logs <service>

# Check load on service
docker-compose stats <service>
```

### 502 Bad Gateway

**Cause**: Service unreachable or crashed
```bash
# Verify service is running
docker-compose exec <service> python manage.py shell

# Check service logs for errors
docker-compose logs -f <service>

# Restart service
docker-compose restart <service>
```

## Performance Tuning

### Connection Pooling
```nginx
upstream backend {
    keepalive 32;  # Reuse connections
}
```

### Buffer Configuration
```nginx
client_body_buffer_size 128k;
client_max_body_size 10m;
proxy_buffer_size 4k;
proxy_buffering on;
proxy_buffers 8 4k;
```

### TCP Tuning
```nginx
sendfile on;
tcp_nopush on;
tcp_nodelay on;
```

## References
- [Nginx Rate Limiting](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
- [Nginx Load Balancing](https://nginx.org/en/docs/http/load_balancing.html)
- [HTTP Status Codes](https://httpwg.org/specs/rfc7231.html#status.codes)
- [API Gateway Patterns](https://microservices.io/patterns/apigateway.html)
