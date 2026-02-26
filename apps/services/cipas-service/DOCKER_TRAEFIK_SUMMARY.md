# CIPAS Service - Docker & Traefik Integration Summary

## Overview

This document summarizes the implementation of Docker containerization and Traefik gateway integration for the CIPAS (Code Clone Detection and Analysis Service).

---

## ✅ Completed Tasks

### 1. Docker Configuration

#### Created Files:

**`Dockerfile`** - Multi-stage build for production deployment
- **Stage 1 (Builder)**: Python 3.14-slim with Poetry, builds dependencies
- **Stage 2 (Runtime)**: Minimal Python image with only runtime files
- Health check included
- Exposes port 8085

**`.dockerignore`** - Excludes unnecessary files from Docker build
- Excludes: `__pycache__`, `.venv/`, `datasets/`, models, logs
- Includes: Application code, dependencies, README

### 2. Traefik Gateway Integration

#### Updated Files:

**`docker-compose.yaml`** - Updated CIPAS service configuration
```yaml
cipas-service:
  build:
    context: ./apps/services/cipas-service
    dockerfile: Dockerfile
  container_name: cipas-service
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.cipas.rule=PathPrefix(`/api/v1/cipas`) || PathPrefix(`/health`) || PathPrefix(`/ready`)"
    - "traefik.http.routers.cipas.entrypoints=web"
    - "traefik.http.services.cipas-service.loadbalancer.server.port=8085"
    - "traefik.http.middlewares.cipas-limit.buffering.maxRequestBodyBytes=52428800"  # 50 MB
    - "traefik.http.middlewares.cipas-ratelimit.ratelimit.average=200"
    - "traefik.http.middlewares.cipas-ratelimit.ratelimit.period=1m"
    - "traefik.http.middlewares.cipas-ratelimit.ratelimit.burst=20"
  ports:
    - "8085:8085"  # Direct access for development
```

**Routing Configuration**:
- `/api/v1/cipas/*` → All CIPAS API endpoints
- `/health` → Health check endpoint
- `/ready` → Readiness probe endpoint

**Middleware**:
- **Request Size Limit**: 50 MB (accommodates 200 × 1 MB files)
- **Rate Limiting**: 200 requests/minute with burst of 20

### 3. Bruno API Collection

#### Created Files:

**`bruno/CIPAS Service/folder.bru`** - Folder configuration
- Sequence: 6
- Inherits collection auth

**`bruno/CIPAS Service/README.md`** - Collection documentation
- Endpoint descriptions
- Usage examples
- Configuration instructions

**Bruno API Endpoints**:

1. **Health Check.bru** - GET `/api/v1/cipas/health`
2. **Compare Two Codes.bru** - POST `/api/v1/cipas/compare`
3. **Compare Batch.bru** - POST `/api/v1/cipas/compare/batch`
4. **Tokenize Code.bru** - POST `/api/v1/cipas/tokenize`
5. **Feature Importance.bru** - GET `/api/v1/cipas/feature-importance`
6. **Model Status.bru** - GET `/api/v1/cipas/models`

#### Updated Files:

**`bruno/environments/GradeLoop.bru`** - Updated environment variables
```bru
CIPAS_BASE_URL: {{BASE_URL}}  # Changed from http://localhost:8085
CIPAS_URL_V1: {{CIPAS_BASE_URL}}/api/v1/cipas
```

Now all CIPAS requests go through Traefik at `http://localhost:8000`

### 4. Application Updates

#### Updated Files:

**`main.py`** - Added readiness endpoint and environment configuration
```python
@app.get("/ready")
async def readiness_check():
    """Check if service is ready to accept requests."""
    # Verifies application is running and models are loaded

if __name__ == "__main__":
    port = int(os.getenv("CIPAS_PORT", 8085))
    host = os.getenv("CIPAS_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
```

**Documentation Created**:
- **`DEPLOYMENT.md`** - Comprehensive Docker deployment guide
- **`API_DOCUMENTATION.md`** - Complete API reference
- **Updated `QUICKSTART.md`** - Added API usage section

---

## Architecture

### Network Flow

```
┌──────────────────┐
│   Bruno/Client   │
└────────┬─────────┘
         │
         │ http://localhost:8000
         │
         ▼
┌──────────────────┐
│   Traefik        │
│   Gateway        │
│   (Port 8000)    │
└────────┬─────────┘
         │
         │ /api/v1/cipas/*
         │ /health
         │ /ready
         │
         ▼
┌──────────────────┐
│ cipas-service    │
│ (Port 8085)      │
└──────────────────┘
```

### Access Patterns

| Access Method | URL | Use Case |
|---------------|-----|----------|
| **Via Traefik** | `http://localhost:8000/api/v1/cipas/*` | Production, Bruno |
| **Direct** | `http://localhost:8085/*` | Development, debugging |

---

## Endpoints Summary

### Via Traefik (Recommended)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/cipas/health` | GET | Service health check |
| `/api/v1/cipas/ready` | GET | Readiness probe |
| `/api/v1/cipas/compare` | POST | Compare two codes |
| `/api/v1/cipas/compare/batch` | POST | Batch comparison |
| `/api/v1/cipas/tokenize` | POST | Tokenize code |
| `/api/v1/cipas/feature-importance` | GET | Feature importance |
| `/api/v1/cipas/models` | GET | Model status |

### Interactive Documentation

- **Swagger UI**: http://localhost:8000/api/v1/cipas/docs
- **ReDoc**: http://localhost:8000/api/v1/cipas/redoc
- **Traefik Dashboard**: http://localhost:8080

---

## Usage Guide

### 1. Start the Service

```bash
cd /home/iamdasun/Projects/4yrg/gradeloop-core-v2

# Start CIPAS service with dependencies
docker-compose up -d cipas-service

# View logs
docker-compose logs -f cipas-service
```

### 2. Verify Deployment

```bash
# Check health via Traefik
curl http://localhost:8000/api/v1/cipas/health

# Check readiness
curl http://localhost:8000/api/v1/cipas/ready

# Direct access (bypass Traefik)
curl http://localhost:8085/health
```

### 3. Test with Bruno

1. Open Bruno
2. Load "GradeLoop V2 API Collection"
3. Select "GradeLoop" environment
4. Navigate to "CIPAS Service" folder
5. Click any endpoint and send request

### 4. Example: Compare Codes

```bash
curl -X POST http://localhost:8000/api/v1/cipas/compare \
  -H "Content-Type: application/json" \
  -d '{
    "code1": "public int foo(int x) { return x + 1; }",
    "code2": "public int bar(int y) { return y + 1; }",
    "language": "java",
    "pipeline": "both"
  }'
```

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CIPAS_PORT` | `8085` | HTTP port |
| `CIPAS_HOST` | `0.0.0.0` | Bind address |
| `CIPAS_ENV` | `development` | Environment |
| `CIPAS_LOG_LEVEL` | `INFO` | Logging level |
| `CIPAS_PARSER_WORKERS` | `0` | Parser workers (0=auto) |
| `CIPAS_MAX_CONCURRENT_BATCHES` | `4` | Max concurrent batches |

### Docker Compose Configuration

```yaml
cipas-service:
  build:
    context: ./apps/services/cipas-service
    dockerfile: Dockerfile
  container_name: cipas-service
  restart: unless-stopped
  ports:
    - "8085:8085"
  environment:
    - CIPAS_PORT=8085
    - CIPAS_HOST=0.0.0.0
  depends_on:
    cipas-postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8085/api/v1/cipas/ready"]
    interval: 15s
    timeout: 5s
    retries: 5
    start_period: 60s
```

---

## Testing Checklist

### ✅ Docker Build
- [x] Dockerfile created with multi-stage build
- [x] .dockerignore configured
- [x] Dependencies properly installed
- [x] Tree-sitter parsers built

### ✅ Traefik Integration
- [x] Labels configured in docker-compose.yaml
- [x] Routing rules for /api/v1/cipas/*
- [x] Request size limit middleware (50 MB)
- [x] Rate limiting middleware (200 req/min)
- [x] Health check endpoint routed

### ✅ Bruno Collection
- [x] CIPAS Service folder created
- [x] Health Check endpoint
- [x] Compare Two Codes endpoint
- [x] Compare Batch endpoint
- [x] Tokenize Code endpoint
- [x] Feature Importance endpoint
- [x] Model Status endpoint
- [x] Environment updated to use Traefik URL

### ✅ Application Updates
- [x] Readiness endpoint (/ready)
- [x] Environment-based port configuration
- [x] Health endpoint (/health)
- [x] All comparison endpoints working

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs cipas-service

# Verify models exist
docker-compose exec cipas-service ls -la clone_detection/models/saved/
```

### Traefik Routing Issues

```bash
# Check Traefik logs
docker-compose logs traefik | grep cipas

# Verify labels
docker inspect cipas-service | grep -A 20 Labels

# Test direct access
curl http://localhost:8085/health
```

### Bruno Connection Issues

1. Verify environment variable:
   ```
   CIPAS_BASE_URL: {{BASE_URL}}
   ```

2. Check Traefik is running:
   ```bash
   docker-compose ps traefik
   ```

3. Test directly:
   ```bash
   curl http://localhost:8000/api/v1/cipas/health
   ```

---

## Performance Considerations

### Request Size Limits

- **Traefik**: 50 MB (configured in middleware)
- **Service**: 50 MB per batch (configured in application)
- **Per-file**: 1 MB maximum

### Rate Limiting

- **Average**: 200 requests/minute
- **Burst**: 20 requests
- Adjust based on deployment requirements

### Resource Allocation

Recommended for production:
```yaml
resources:
  limits:
    cpus: '2.0'
    memory: 2G
  reservations:
    cpus: '1.0'
    memory: 1G
```

---

## Next Steps

### For Development

1. Start all services:
   ```bash
   docker-compose up -d
   ```

2. Open Bruno and test endpoints

3. Access Swagger UI:
   http://localhost:8000/api/v1/cipas/docs

### For Production

1. Update environment variables for production
2. Enable TLS in Traefik
3. Remove direct port exposure (8085:8085)
4. Configure monitoring and alerting
5. Set up log aggregation

---

## Files Created/Modified

### Created Files (7)
1. `apps/services/cipas-service/Dockerfile`
2. `apps/services/cipas-service/.dockerignore`
3. `apps/services/cipas-service/DEPLOYMENT.md`
4. `bruno/CIPAS Service/folder.bru`
5. `bruno/CIPAS Service/README.md`
6. `bruno/CIPAS Service/Health Check.bru`
7. `bruno/CIPAS Service/Compare Two Codes.bru`
8. `bruno/CIPAS Service/Compare Batch.bru`
9. `bruno/CIPAS Service/Tokenize Code.bru`
10. `bruno/CIPAS Service/Feature Importance.bru`
11. `bruno/CIPAS Service/Model Status.bru`

### Modified Files (3)
1. `docker-compose.yaml` - Updated Traefik labels
2. `bruno/environments/GradeLoop.bru` - Updated CIPAS_BASE_URL
3. `apps/services/cipas-service/main.py` - Added /ready endpoint

---

## References

- **API Documentation**: `apps/services/cipas-service/API_DOCUMENTATION.md`
- **Quick Start**: `apps/services/cipas-service/QUICKSTART.md`
- **Clone Detection**: `apps/services/cipas-service/CLONE_DETECTION_README.md`
- **Traefik Docs**: https://doc.traefik.io/traefik/
- **Bruno Docs**: https://www.usebruno.com/documentation

---

## License

Part of the Gradeloop Core project.
