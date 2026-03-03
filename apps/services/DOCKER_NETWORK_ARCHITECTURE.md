# Docker Network Architecture - GradeLoop Core V2

This document describes the Docker networking architecture for GradeLoop Core V2, where all microservices communicate via an internal Docker network and are exposed only through the Traefik API gateway.

---

## Table of Contents

- [Overview](#overview)
- [Network Topology](#network-topology)
- [Service Communication](#service-communication)
- [Traefik Gateway Configuration](#traefik-gateway-configuration)
- [Security Considerations](#security-considerations)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Overview

GradeLoop Core V2 uses a **gateway pattern** where:

1. **All services run on an internal Docker network** (`gradeloop-network`)
2. **Services communicate via service names** (Docker DNS), not localhost
3. **Only Traefik gateway is exposed** to the host network
4. **Internal services are NOT directly accessible** from outside

### Benefits

| Benefit | Description |
|---------|-------------|
| **Security** | Services isolated from external network |
| **Simplified Routing** | Single entry point (Traefik) |
| **Service Discovery** | Docker DNS resolves service names |
| **Load Balancing** | Traefik handles load balancing |
| **Rate Limiting** | Centralized at gateway layer |
| **SSL Termination** | Handled at gateway |

---

## Network Topology

```
                                    ┌─────────────────────────────────────────┐
                                    │         Host Network                    │
                                    │                                         │
                                    │  Port 8000 → Traefik HTTP               │
                                    │  Port 8080 → Traefik Dashboard          │
                                    │                                         │
                                    └──────────────┬──────────────────────────┘
                                                   │
                                                   ▼
                                    ┌─────────────────────────────────────────┐
                                    │      gradeloop-network (internal)       │
                                    │                                         │
                                    │  ┌─────────────┐                        │
                                    │  │   Traefik   │ ← Gateway              │
                                    │  │  (Proxy)    │                        │
                                    │  └──────┬──────┘                        │
                                    │         │                               │
                                    │    ┌────┴────┬──────────┬──────────┐    │
                                    │    │         │          │          │    │
                                    │    ▼         ▼          ▼          ▼    │
                                    │ ┌──────┐ ┌──────┐ ┌────────┐ ┌────────┐│
                                    │ │ IAM  │ │Email │ │Academic│ │Assess. ││
                                    │ │:8081 │ │:8082 │ │ :8083  │ │ :8084  ││
                                    │ └──────┘ └──────┘ └────────┘ └────────┘│
                                    │                                         │
                                    │ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                                    │ │  CIPAS   │ │  ACAFS   │ │  MinIO   │ │
                                    │ │  :8085   │ │  :8086   │ │  :9000   │ │
                                    │ └──────────┘ └──────────┘ └──────────┘ │
                                    │                                         │
                                    │ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                                    │ │Syntactics│ │Semantics │ │ RabbitMQ │ │
                                    │ │  :8086   │ │  :8087   │ │  :5672   │ │
                                    │ └──────────┘ └──────────┘ └──────────┘ │
                                    │                                         │
                                    └─────────────────────────────────────────┘
```

---

## Service Communication

### Internal Service URLs

Services communicate using Docker DNS with the pattern:

```
http://<service-name>:<port>
```

| Service | Container Name | Internal URL | Port |
|---------|---------------|--------------|------|
| IAM Service | `iam-service` | `http://iam-service:8081` | 8081 |
| Email Service | `email-service` | `http://email-service:8082` | 8082 |
| Academic Service | `academic-service` | `http://academic-service:8083` | 8083 |
| Assessment Service | `assessment-service` | `http://assessment-service:8084` | 8084 |
| CIPAS Service | `cipas-service` | `http://cipas-service:8085` | 8085 |
| ACAFS Service | `acafs-service` | `http://acafs-service:8086` | 8086 |
| CIPAS Syntactics | `cipas-syntactics` | `http://cipas-syntactics:8086` | 8086 |
| CIPAS Semantics | `cipas-semantics` | `http://cipas-semantics:8087` | 8087 |
| MinIO | `minio` | `http://minio:9000` | 9000 |
| RabbitMQ | `rabbitmq` | `amqp://rabbitmq:5672` | 5672 |
| PostgreSQL | `cipas-postgres` | `postgresql://cipas-postgres:5432` | 5432 |

### Example: Service-to-Service Communication

**Go (Fiber):**
```go
// Email client in IAM service
emailClient := fiber.New()
emailClient.BaseURL = "http://email-service:8082"

// Send email
resp, err := emailClient.Post("/api/v1/emails/send", payload)
```

**Python (FastAPI):**
```python
# IAM client in Assessment service
IAM_SERVICE_URL = os.getenv("IAM_SERVICE_URL", "http://iam-service:8081")

async def verify_token(token: str):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{IAM_SERVICE_URL}/api/v1/tokens/verify",
            headers={"Authorization": f"Bearer {token}"}
        )
    return resp.json()
```

---

## Traefik Gateway Configuration

### Entry Points

| Entry Point | Port | Purpose |
|-------------|------|---------|
| `web` | 8000 | Main HTTP entry point for all API traffic |
| `traefik` | 8080 | Traefik dashboard (development only) |

### Routing Rules

Traefik routes requests based on path prefixes:

| Path Prefix | Service | Port |
|-------------|---------|------|
| `/api/v1/auth` | IAM | 8081 |
| `/api/v1/users` | IAM | 8081 |
| `/api/v1/roles` | IAM | 8081 |
| `/api/v1/permissions` | IAM | 8081 |
| `/api/v1/emails` | Email | 8082 |
| `/api/v1/departments` | Academic | 8083 |
| `/api/v1/courses` | Academic | 8083 |
| `/api/v1/assignments` | Assessment | 8084 |
| `/api/v1/submissions` | Assessment | 8084 |
| `/api/v1/cipas` | CIPAS | 8085 |
| `/api/v1/acafs` | ACAFS | 8086 |
| `/api/v1/syntactics` | CIPAS Syntactics | 8086 |
| `/api/v1/semantics` | CIPAS Semantics | 8087 |

### Docker Labels Example

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.iam.rule=PathPrefix(`/api/v1/auth`)"
  - "traefik.http.routers.iam.entrypoints=web"
  - "traefik.http.services.iam-service.loadbalancer.server.port=8081"
  - "traefik.http.middlewares.global-ratelimit.ratelimit.average=1000"
  - "traefik.http.middlewares.global-ratelimit.ratelimit.period=1m"
  - "traefik.http.routers.iam.middlewares=global-ratelimit"
```

---

## Security Considerations

### Network Isolation

```yaml
networks:
  - gradeloop-network

# Services cannot communicate outside this network
# unless explicitly allowed via host port mapping
```

### No Direct Port Exposure

Internal services use `expose` (not `ports`):

```yaml
# ✅ CORRECT: Internal only
expose:
  - "8081"

# ❌ WRONG: Directly accessible from host
ports:
  - "8081:8081"
```

### Non-Root Users

All Dockerfiles run as non-root users:

```dockerfile
# Go services (distroless)
USER 65532:65532

# Python services
RUN useradd --create-home --uid 1000 cipas-service
USER cipas-service
```

### Read-Only Filesystems (Production)

For production, consider:

```yaml
services:
  iam-service:
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
```

---

## Environment Variables

### Service Discovery Variables

Set these in your `.env` file:

```bash
# Internal service URLs (DO NOT use localhost)
IAM_SERVICE_URL=http://iam-service:8081
EMAIL_SERVICE_URL=http://email-service:8082
ACADEMIC_SERVICE_URL=http://academic-service:8083
ASSESSMENT_SERVICE_URL=http://assessment-service:8084
CIPAS_SERVICE_URL=http://cipas-service:8085
ACAFS_SERVICE_URL=http://acafs-service:8086
CIPAS_SYNTACTICS_URL=http://cipas-syntactics:8086
CIPAS_SEMANTICS_URL=http://cipas-semantics:8087

# Database (internal network)
GRA_DB_HOST=cipas-postgres
GRA_DB_PORT=5432

# MinIO (internal network)
MINIO_ENDPOINT=minio:9000
MINIO_PUBLIC_HOST=http://localhost:9000  # Only for external access

# RabbitMQ (internal network)
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/
```

### Binding to All Interfaces

Ensure services bind to `0.0.0.0` (not `127.0.0.1`):

```bash
# Go services
HOST=0.0.0.0
PORT=8081

# Python services
CIPAS_HOST=0.0.0.0
CIPAS_PORT=8085
```

---

## Troubleshooting

### Service Cannot Reach Another Service

**Check network membership:**
```bash
docker network inspect gradeloop-network
```

**Test DNS resolution:**
```bash
docker exec iam-service ping -c 3 email-service
```

**Test HTTP connectivity:**
```bash
docker exec iam-service curl -v http://email-service:8082/health
```

### Traefik Not Routing to Service

**Check labels:**
```bash
docker inspect iam-service | grep traefik
```

**Verify service is healthy:**
```bash
docker inspect iam-service --format='{{.State.Health.Status}}'
```

**Check Traefik logs:**
```bash
docker logs traefik --tail 100
```

### Service Binding Errors

**Ensure binding to 0.0.0.0:**
```bash
# Inside container
docker exec iam-service netstat -tlnp

# Should show 0.0.0.0:8081, NOT 127.0.0.1:8081
```

**Check environment variables:**
```bash
docker exec iam-service env | grep HOST
```

---

## Quick Reference

### Test Internal Service from Host

```bash
# Via Traefik (external)
curl http://localhost:8000/api/v1/auth/login

# Direct to container (debugging only)
docker exec iam-service curl http://localhost:8081/health
```

### Network Commands

```bash
# List networks
docker network ls

# Inspect network
docker network inspect gradeloop-network

# Connect running container to network
docker network connect gradeloop-network <container>

# Disconnect container
docker network disconnect gradeloop-network <container>
```

### Service Discovery Test

```bash
# From inside any service container
docker exec -it iam-service sh

# Test DNS
nslookup email-service

# Test HTTP
curl http://email-service:8082/health
```

---

## References

- [Docker Networking Overview](https://docs.docker.com/network/)
- [Traefik Routing](https://doc.traefik.io/traefik/routing/routers/)
- [Docker Compose Networking](https://docs.docker.com/compose/networking/)
- [Traefik Docker Provider](https://doc.traefik.io/traefik/providers/docker/)

---

**Last Updated**: March 2026  
**Maintained By**: GradeLoop DevOps Team
