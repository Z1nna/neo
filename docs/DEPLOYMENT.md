# PRODUCTION DEPLOYMENT GUIDE

## Overview
This guide covers deploying the complete NeoMarket microservices platform with observability, resilience, and API Gateway.

## Complete Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENTS (Web, Mobile, B2B)                  │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│              API GATEWAY (Nginx + Rate Limiting)                │
│  • Authentication: JWT validation delegation                     │
│  • Rate Limiting: Per-user, per-IP, per-endpoint                │
│  • Load Balancing: Least connections algorithm                  │
│  • Security: CORS, CSRF, XSS protection                         │
│  • Monitoring: Request logging & tracing                        │
└─────────────────────────────────────────────────────────────────┘
        ↓                    ↓                    ↓
    ┌───────────┐        ┌───────────┐      ┌───────────┐
    │ Auth Svc  │        │ B2B Svc   │      │ Catalog   │
    └───────────┘        └───────────┘      └───────────┘
        ↓                    ↓                    ↓
    ┌──────────────────────────────────────────────────┐
    │         PostgreSQL (Multi-Database)              │
    │  - auth_db, b2b_db, catalog_db, payments_db...   │
    └──────────────────────────────────────────────────┘
        ↓
    ┌──────────────────────────────────────────────────┐
    │         Redis (Event Bus + Cache)                │
    │  - neomarket.events (main stream)                │
    │  - neomarket.events.dlq (dead letter queue)      │
    │  - neomarket.events.failed (retry queue)         │
    └──────────────────────────────────────────────────┘
        ↓
    ┌──────────────────────────────────────────────────┐
    │       OBSERVABILITY STACK                        │
    │  - Jaeger (Distributed Tracing)                  │
    │  - Prometheus (Metrics)                          │
    │  - Grafana (Dashboards)                          │
    │  - Loki (Centralized Logging)                    │
    └──────────────────────────────────────────────────┘
```

## Pre-Deployment Checklist

- [ ] All services built and tested locally
- [ ] Environment variables configured (see `.env.example`)
- [ ] Database migrations created and tested
- [ ] Redis Streams consumer groups configured
- [ ] SSL certificates prepared (for production)
- [ ] Backup procedures documented
- [ ] Monitoring alerts configured
- [ ] Disaster recovery plan in place
- [ ] Team trained on operations

## Local Development Deployment

### 1. Start Infrastructure

```bash
# Clone repository
git clone https://github.com/company/neomarket.git
cd neomarket

# Build all services
docker-compose build

# Start everything
docker-compose up -d

# View status
docker-compose ps
docker-compose logs -f
```

### 2. Initialize Databases

```bash
# Migrations run automatically on service start
# But verify manually:
docker-compose exec b2b python manage.py migrate --check
docker-compose exec catalog python manage.py migrate --check
# ... repeat for all services
```

### 3. Verify Services

```bash
# Health checks
curl http://localhost:8888/health

# Access API Gateway
curl http://localhost:8888/api/v1/catalog/products/

# Check Grafana
open http://localhost:3000  # admin/admin

# Check Prometheus
open http://localhost:9090

# Check Jaeger
open http://localhost:16686
```

### 4. Seed Initial Data

```bash
# Load demo catalog
docker-compose exec catalog python manage.py seed_demo_catalog

# Create test user
docker-compose exec auth python manage.py create_test_user \
    --email test@example.com --password password123
```

## Containerized Deployment (Docker Compose)

### Configuration

Create `.env` file:
```bash
# Database
DB_USER=neomarket
DB_PASSWORD=<secure-password>
DB_HOST=postgres
DB_PORT=5432

# Redis
REDIS_URL=redis://redis:6379/0

# JWT Configuration
JWT_ALGORITHM=RS256
JWT_ISSUER=https://auth.neomarket.io
JWT_AUDIENCE=neomarket-services
JWT_SIGNING_KEY=<private-key>
JWT_PUBLIC_KEY=<public-key>

# Observability
OTEL_ENABLED=true
JAEGER_HOST=jaeger:6831
LOG_LEVEL=INFO

# API Gateway
RATE_LIMIT_GENERAL=10
RATE_LIMIT_AUTH=5
RATE_LIMIT_PAYMENTS=20
```

### Deployment Steps

```bash
# 1. Build images
docker-compose build

# 2. Start services (ordered by dependencies)
docker-compose up -d postgres redis
docker-compose up -d jaeger prometheus grafana loki
docker-compose up -d auth catalog cart orders moderation b2b payments ...
docker-compose up -d b2b-outbox moderation-outbox orders-outbox ...
docker-compose up -d api_gateway frontend

# 3. Run migrations
docker-compose exec b2b python manage.py migrate
docker-compose exec catalog python manage.py migrate
# ... repeat for all services

# 4. Create event consumer groups
docker-compose exec catalog python manage.py consume_domain_events &
docker-compose exec orders python manage.py consume_domain_events &

# 5. Publish outbox events
docker-compose exec b2b python manage.py publish_outbox_events &
docker-compose exec payments python manage.py publish_outbox_events &
# ... repeat for all services with outbox

# 6. Verify all services healthy
docker-compose ps
```

### Stopping Services

```bash
# Graceful shutdown (30s timeout)
docker-compose down

# With volume cleanup (warning: loses data)
docker-compose down -v

# Individual service restart
docker-compose restart b2b
```

## Kubernetes Deployment (Production)

### Prerequisites
- Kubernetes cluster 1.20+
- helm 3+
- kubectl configured

### Setup Helm Chart

Create `neomarket-helm/values.yaml`:

```yaml
# Replica configuration
replicas:
  auth: 2
  b2b: 3
  payments: 3
  catalog: 3
  orders: 3

# Resource requests/limits
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"

# Database
database:
  host: postgres.default.svc.cluster.local
  port: 5432
  ssl: true

# Ingress
ingress:
  enabled: true
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  tls:
    - secretName: neomarket-tls
      hosts:
        - api.neomarket.io

# Observability
observability:
  enabled: true
  tracing:
    jaeger: jaeger.monitoring.svc.cluster.local:6831
  metrics:
    prometheus: prometheus.monitoring.svc.cluster.local:9090
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace neomarket

# Create secrets
kubectl create secret generic db-credentials \
    --from-literal=password=<db-password> \
    -n neomarket

kubectl create secret generic jwt-keys \
    --from-file=private-key=./jwt.key \
    --from-file=public-key=./jwt.pub \
    -n neomarket

# Deploy with Helm
helm install neomarket ./neomarket-helm \
    -n neomarket \
    -f values.yaml

# Verify deployment
kubectl get pods -n neomarket
kubectl get svc -n neomarket

# Check logs
kubectl logs -f deployment/b2b -n neomarket
```

## Health & Readiness Probes

### Kubernetes Example

```yaml
containers:
- name: b2b
  livenessProbe:
    httpGet:
      path: /health/
      port: 8000
    initialDelaySeconds: 30
    periodSeconds: 10
    failureThreshold: 3
    timeoutSeconds: 5
  
  readinessProbe:
    httpGet:
      path: /health/
      port: 8000
    initialDelaySeconds: 10
    periodSeconds: 5
    failureThreshold: 2
    timeoutSeconds: 3
```

## Database Backup & Recovery

### Automated Backups

```bash
# Create backup script
cat > backup_postgres.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/backups/neomarket
DATE=$(date +%Y%m%d_%H%M%S)

for DB in auth_db b2b_db catalog_db payments_db orders_db logistics_db reviews_db promo_db moderation_db antifraud_db; do
    pg_dump -h $DB_HOST -U $DB_USER $DB | gzip > $BACKUP_DIR/$DB-$DATE.sql.gz
done

# Retention: Keep backups for 30 days
find $BACKUP_DIR -type f -mtime +30 -delete
EOF

# Schedule with cron (daily at 2 AM)
0 2 * * * /opt/backup_postgres.sh

# Or with Kubernetes CronJob
kubectl apply -f - << 'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: postgres-backup
          containers:
          - name: backup
            image: postgres:16-alpine
            command: ["/backup.sh"]
EOF
```

### Restore Procedure

```bash
# List available backups
ls -la /backups/neomarket/catalog_db-*.sql.gz

# Restore specific database
BACKUP_FILE=/backups/neomarket/catalog_db-20240115_020000.sql.gz
DB_NAME=catalog_db_restore

# Create new database
createdb $DB_NAME

# Restore from backup
gunzip -c $BACKUP_FILE | psql $DB_NAME

# Verify
psql $DB_NAME -c "SELECT COUNT(*) FROM products;"
```

## Monitoring & Alerting

### Key Metrics to Monitor

```promql
# Service health
up{job="prometheus"}

# Request rate & latency
rate(nginx_requests_total[5m])
histogram_quantile(0.95, rate(nginx_request_duration_seconds_bucket[5m]))

# Error rate
rate(nginx_requests_total{status=~"5.."}[5m])

# Database connections
pg_stat_activity_count

# Event bus
redis_stream_length{stream="neomarket.events"}
redis_stream_length{stream="neomarket.events.dlq"}

# Consumer lag
redis_consumer_pending_count
```

### Alert Rules (Prometheus)

```yaml
groups:
- name: neomarket-critical
  interval: 30s
  rules:
  - alert: ServiceDown
    expr: up == 0
    for: 2m
    annotations:
      severity: critical
      summary: "{{ $labels.job }} is down"

  - alert: HighErrorRate
    expr: rate(nginx_requests_total{status=~"5.."}[5m]) > 0.1
    for: 5m
    annotations:
      severity: warning
      summary: "Error rate > 10%"

  - alert: DLQBacklog
    expr: redis_stream_length{stream="neomarket.events.dlq"} > 100
    for: 10m
    annotations:
      severity: warning
      summary: "{{ $value }} messages in DLQ"

  - alert: DatabaseConnectionPoolExhausted
    expr: pg_stat_activity_count / pg_setting_max_connections > 0.9
    for: 5m
    annotations:
      severity: critical
      summary: "Database connections near max"
```

## Incident Response

### Service Degradation

```bash
# 1. Check service health
curl -s http://api.neomarket.io/health | jq

# 2. View recent errors
docker-compose logs --tail=100 <service> | grep ERROR

# 3. Check resource usage
docker stats  # or: kubectl top nodes/pods

# 4. View DLQ for stuck messages
python manage.py dlq_manage list --limit 50

# 5. Restart affected service
docker-compose restart <service>
# or: kubectl rollout restart deployment/<service>
```

### Database Issues

```bash
# Check connection count
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE state = 'idle' AND query_start < now() - interval '10 hours';

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Analyze/vacuum tables
VACUUM ANALYZE;
```

## Scaling Strategy

### Horizontal Scaling

```bash
# Docker Compose: Run multiple instances
docker-compose up -d --scale b2b=3 --scale payments=5

# Kubernetes: Update replicas
kubectl scale deployment b2b --replicas=5 -n neomarket
```

### Load Testing

```bash
# Using Apache Bench
ab -n 10000 -c 100 http://api.neomarket.io/api/v1/catalog/products/

# Using k6
k6 run load_test.js --vus 100 --duration 60s
```

## Security Hardening

### Environment Variables (Secrets)

```bash
# Store in secure vault (e.g., HashiCorp Vault, AWS Secrets Manager)
# Never commit sensitive data to git

# For Docker: Use .env file (gitignored)
# For Kubernetes: Use Secrets
kubectl create secret generic app-secrets \
    --from-literal=db-password=<secret> \
    --from-literal=jwt-key=<secret>
```

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: neomarket-network-policy
spec:
  podSelector:
    matchLabels:
      app: neomarket
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: neomarket
    - podSelector:
        matchLabels:
          role: api-gateway
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: neomarket
  - to:
    - podSelector:
        matchLabels:
          role: dns
```

### TLS/mTLS Configuration

```bash
# Generate certificates
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem

# For mTLS between services
# Use Istio or Linkerd service mesh for automatic mTLS enforcement
```

## Documentation & Runbooks

Maintain runbooks for:
- Service restart procedures
- Database backup/restore
- Certificate renewal
- Emergency escalation contacts
- SLA definitions and SLIs

See `docs/` directory for complete guides:
- `OBSERVABILITY.md` - Monitoring setup
- `RESILIENCE.md` - Retry & DLQ handling
- `API_GATEWAY.md` - Rate limiting & routing

## Support & Escalation

**Team Structure**:
- **Level 1 Support**: Monitor alerts, basic troubleshooting
- **Level 2 Support**: Service debugging, database issues
- **Level 3 Support**: Architecture decisions, capacity planning

**On-call rotation**: Implement 24/7 pager duty rotation

## References

- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [PostgreSQL Administration](https://www.postgresql.org/docs/current/admin.html)
- [Redis Persistence](https://redis.io/docs/management/persistence/)
- [Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator)
