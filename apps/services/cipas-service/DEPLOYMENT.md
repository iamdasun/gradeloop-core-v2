# CIPAS Service - Docker Deployment Guide

This guide explains how to deploy the CIPAS (Code Clone Detection and Analysis Service) using Docker and Traefik.

## Architecture

```
┌─────────────────┐
│   Traefik       │ Port 8000
│   Gateway       │
└────────┬────────┘
         │
         ├─→ /api/v1/cipas/* ──→ cipas-service:8085
         │
         └─→ /health, /ready ──→ cipas-service:8085
```

## Quick Start

### 1. Build and Start the Service

```bash
cd /home/iamdasun/Projects/4yrg/gradeloop-core-v2

# Start CIPAS service with dependencies
docker-compose up -d cipas-service
```

### 2. Verify Deployment

```bash
# Check service status
docker-compose ps cipas-service

# View logs
docker-compose logs -f cipas-service

# Test health endpoint via Traefik
curl http://localhost:8000/api/v1/cipas/health

# Test directly (bypass Traefik)
curl http://localhost:8085/health
```

### 3. Access Interactive API Docs

Open in browser:
```
http://localhost:8000/api/v1/cipas/docs
```

## Traefik Configuration

### Routing Rules

The CIPAS service is routed through Traefik with the following rules:

| Path Pattern | Destination |
|--------------|-------------|
| `/api/v1/cipas/*` | cipas-service:8085 |
| `/health` | cipas-service:8085 |
| `/ready` | cipas-service:8085 |

### Middleware

**Request Size Limit**: 50 MB
- Accommodates batches of up to 200 × 1 MB files

**Rate Limiting**:
- Average: 200 requests/minute
- Burst: 20 requests

### Labels in docker-compose.yaml

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.cipas.rule=PathPrefix(`/api/v1/cipas`) || PathPrefix(`/health`) || PathPrefix(`/ready`)"
  - "traefik.http.routers.cipas.entrypoints=web"
  - "traefik.http.services.cipas-service.loadbalancer.server.port=8085"
  - "traefik.http.middlewares.cipas-limit.buffering.maxRequestBodyBytes=52428800"
  - "traefik.http.middlewares.cipas-ratelimit.ratelimit.average=200"
  - "traefik.http.middlewares.cipas-ratelimit.ratelimit.period=1m"
  - "traefik.http.middlewares.cipas-ratelimit.ratelimit.burst=20"
  - "traefik.http.routers.cipas.middlewares=cipas-limit,cipas-ratelimit"
```

## Dockerfile Structure

The Dockerfile uses a multi-stage build:

### Stage 1: Builder
- Python 3.14-slim base
- Installs Poetry and dependencies
- Builds Tree-sitter parsers
- Compiles application

### Stage 2: Runtime
- Python 3.14-slim (minimal image)
- Copies only necessary files from builder
- Exposes port 8085
- Includes health check

## Environment Variables

### Runtime
| Variable | Default | Description |
|----------|---------|-------------|
| `CIPAS_ENV` | `development` | Environment (development/production) |
| `CIPAS_LOG_LEVEL` | `INFO` | Logging level |
| `CIPAS_PORT` | `8085` | HTTP port |
| `CIPAS_HOST` | `0.0.0.0` | Bind address |

### Database
| Variable | Default | Description |
|----------|---------|-------------|
| `CIPAS_DATABASE_URL` | - | PostgreSQL connection string |
| `CIPAS_DB_MIN_POOL_SIZE` | `5` | Minimum DB pool size |
| `CIPAS_DB_MAX_POOL_SIZE` | `20` | Maximum DB pool size |

### Performance
| Variable | Default | Description |
|----------|---------|-------------|
| `CIPAS_PARSER_WORKERS` | `0` | Number of parser workers (0 = auto) |
| `CIPAS_MAX_CONCURRENT_BATCHES` | `4` | Max concurrent batch operations |
| `CIPAS_BATCH_SEMAPHORE_TIMEOUT` | `30.0` | Batch semaphore timeout (seconds) |

## Health Checks

### Liveness Probe
```yaml
test: ["CMD", "curl", "-f", "http://localhost:8085/health"]
interval: 15s
timeout: 5s
retries: 5
start_period: 60s
```

### Readiness Probe
```bash
curl http://localhost:8000/api/v1/cipas/ready
```

Response when ready:
```json
{
  "status": "ready",
  "models_loaded": true
}
```

## Testing with Bruno

### 1. Open Bruno Collection

1. Open Bruno
2. Load "GradeLoop V2 API Collection"
3. Select "GradeLoop" environment
4. Navigate to "CIPAS Service" folder

### 2. Test Endpoints

All CIPAS endpoints are configured to use Traefik gateway:
```
CIPAS_BASE_URL: {{BASE_URL}}  # http://localhost:8000
CIPAS_URL_V1: {{CIPAS_BASE_URL}}/api/v1/cipas
```

### Available Requests

1. **Health Check** - GET `/api/v1/cipas/health`
2. **Compare Two Codes** - POST `/api/v1/cipas/compare`
3. **Compare Batch** - POST `/api/v1/cipas/compare/batch`
4. **Tokenize Code** - POST `/api/v1/cipas/tokenize`
5. **Feature Importance** - GET `/api/v1/cipas/feature-importance`
6. **Model Status** - GET `/api/v1/cipas/models`

## Direct Access (Bypass Traefik)

For development/debugging, access the service directly:

```bash
# Health check
curl http://localhost:8085/health

# Compare codes
curl -X POST http://localhost:8085/compare \
  -H "Content-Type: application/json" \
  -d '{
    "code1": "public int foo(int x) { return x + 1; }",
    "code2": "public int bar(int y) { return y + 1; }",
    "language": "java",
    "pipeline": "syntactic"
  }'
```

To use direct access in Bruno, update `environments/GradeLoop.bru`:
```
CIPAS_BASE_URL: http://localhost:8085
```

## Logs and Monitoring

### View Logs
```bash
# Real-time logs
docker-compose logs -f cipas-service

# Last 100 lines
docker-compose logs --tail=100 cipas-service
```

### Traefik Logs
```bash
docker-compose logs -f traefik
```

### Traefik Dashboard
Access at: http://localhost:8080

## Troubleshooting

### Service Won't Start

1. Check logs:
```bash
docker-compose logs cipas-service
```

2. Verify models are trained:
```bash
# Inside container
docker-compose exec cipas-service ls -la clone_detection/models/saved/
```

### Traefik Routing Issues

1. Check Traefik configuration:
```bash
docker-compose exec traefik traefik healthcheck
```

2. Verify labels:
```bash
docker inspect cipas-service | grep -A 20 Labels
```

3. Check Traefik logs for routing decisions:
```bash
docker-compose logs traefik | grep cipas
```

### High Memory Usage

Reduce worker count in docker-compose.yaml:
```yaml
environment:
  - CIPAS_PARSER_WORKERS=2
  - CIPAS_MAX_CONCURRENT_BATCHES=2
```

### Model Loading Fails

Ensure models are trained before deployment:
```bash
cd apps/services/cipas-service
python scripts/train_type3.py --test
python scripts/train_type4.py --test
```

## Production Deployment

### Recommended Settings

```yaml
environment:
  - CIPAS_ENV=production
  - CIPAS_LOG_LEVEL=WARNING
  - CIPAS_PARSER_WORKERS=4
  - CIPAS_MAX_CONCURRENT_BATCHES=8
  
resources:
  limits:
    cpus: '2.0'
    memory: 2G
  reservations:
    cpus: '1.0'
    memory: 1G
```

### Security Considerations

1. **Remove direct port exposure** (use only Traefik):
```yaml
# Remove this line in production:
# - "8085:8085"
```

2. **Use secrets for sensitive data**:
```yaml
secrets:
  - db_password
  - jwt_secret

secrets:
  db_password:
    external: true
```

3. **Enable TLS in Traefik**:
```yaml
labels:
  - "traefik.http.routers.cipas.tls=true"
  - "traefik.http.routers.cipas.tls.certresolver=myresolver"
```

## Scaling

### Horizontal Scaling

To run multiple replicas:

```yaml
deploy:
  replicas: 3
  resources:
    limits:
      cpus: '1.0'
      memory: 1G
```

Note: Traefik will automatically load balance across replicas.

### Vertical Scaling

Increase resources:
```yaml
resources:
  limits:
    cpus: '4.0'
    memory: 4G
```

Increase worker count:
```yaml
environment:
  - CIPAS_PARSER_WORKERS=8
  - CIPAS_MAX_CONCURRENT_BATCHES=16
```

## Backup and Restore

### Backup Models

```bash
docker-compose exec cipas-service tar czf /tmp/models.tar.gz clone_detection/models/saved/
docker cp cipas-service:/tmp/models.tar.gz ./backup/models.tar.gz
```

### Restore Models

```bash
docker cp ./backup/models.tar.gz cipas-service:/tmp/
docker-compose exec cipas-service tar xzf /tmp/models.tar.gz -C /app/
```

## Updates

### Rolling Update

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build cipas-service
```

### Zero-Downtime Update

```bash
# Start new version alongside old
docker-compose up -d --build --scale cipas-service=2 cipas-service

# Stop old container
docker-compose stop cipas-service.1

# Remove old container
docker-compose rm -f cipas-service.1
```

## Monitoring and Metrics

### Prometheus Metrics

Traefik exposes metrics at: http://localhost:8000/metrics

### Health Monitoring

Set up monitoring for:
- `/api/v1/cipas/health` - Service health
- `/api/v1/cipas/ready` - Readiness status
- Response time < 100ms
- Error rate < 1%

## Performance Tuning

### Optimize for Throughput

```yaml
environment:
  - CIPAS_PARSER_WORKERS=0  # Auto-detect CPU cores
  - CIPAS_MAX_CONCURRENT_BATCHES=8
  - CIPAS_BATCH_SEMAPHORE_TIMEOUT=60.0
```

### Optimize for Latency

```yaml
environment:
  - CIPAS_PARSER_WORKERS=2  # Fewer workers, faster context switching
  - CIPAS_MAX_CONCURRENT_BATCHES=2
  - CIPAS_PARSE_TASK_TIMEOUT=15.0
```

## License

Part of the Gradeloop Core project.
