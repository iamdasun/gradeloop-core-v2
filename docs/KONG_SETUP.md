# Kong API Gateway Setup Guide

Production-ready Kong API Gateway configuration for Gradeloop Core v2.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Testing](#testing)
- [Production Checklist](#production-checklist)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        PUBLIC INTERNET                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Kong API Gateway (Port 8000)                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Routes:                                                  │   │
│  │  • Public: /auth/login, /auth/refresh, /auth/activate    │   │
│  │  • Protected: /auth/change-password, /users, /roles      │   │
│  │                                                           │   │
│  │  Plugins:                                                 │   │
│  │  • JWT Authentication (protected routes only)             │   │
│  │  • Rate Limiting (5 req/min on login)                     │   │
│  │  • CORS                                                   │   │
│  │  • Request Size Limiting (1MB max)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Internal Docker Network                       │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │   IAM Service   │    │  Email Service  │    │   RabbitMQ  │ │
│  │   (Port 8081)   │    │   (Port 8082)   │    │  (Port 5672)│ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Network Security

| Service | Port | Access |
|---------|------|--------|
| Kong Proxy | 8000 | Public |
| Kong Admin | 8001 | Internal only (localhost) |
| Kong Status | 8100 | Public (health checks) |
| IAM Service | 8081 | Internal only |
| Email Service | 8082 | Internal only |
| RabbitMQ | 5672/15672 | Internal only |

---

## Quick Start

### Prerequisites

- Docker & Docker Compose v2.0+
- Git

### 1. Clone and Configure

```bash
# Navigate to project root
cd /path/to/gradeloop-core-v2

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# CRITICAL: Change JWT_SECRET_KEY to a strong random value
# Generate with: openssl rand -base64 32
```

### 2. Start Services

```bash
# Start all services (Kong + IAM + dependencies)
docker-compose -f docker-compose.yaml up -d

# View logs
docker-compose logs -f kong
docker-compose logs -f iam-service
```

### 3. Verify Health

```bash
# Check Kong health
curl http://localhost:8000/health

# Check Kong status
curl http://localhost:8100/status

# Expected response:
# {"status": "ok"}
```

---

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET_KEY` | Shared secret for JWT signing/validation | - | ✅ |
| `FRONTEND_URL` | Allowed CORS origin | http://localhost:3000 | ✅ |
| `GRA_DB_*` | Database connection settings | - | ✅ |
| `SUPER_ADMIN_*` | Initial admin credentials | - | ✅ |

### Kong Declarative Config (kong.yml)

The gateway is configured via `kong.yml` in DB-less mode:

```yaml
_format_version: "3.0"

services:
  - name: iam-service
    url: http://iam-service:8081

routes:
  # Public routes (no auth)
  - name: auth-login
    paths: [/auth/login]
    
  # Protected routes (JWT required)
  - name: users
    paths: [/users]
    plugins:
      - name: jwt

plugins:
  - name: cors
  - name: rate-limiting
  - name: request-size-limiting
```

---

## Testing

### Test 1: Health Check (No Auth)

```bash
curl -X GET http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

### Test 2: Login (Public Route)

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@gradeloop.com",
    "password": "YourSecurePassword123!"
  }'
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "superadmin@gradeloop.com",
      "role": "super_admin"
    }
  }
}
```

---

### Test 3: Access Protected Route WITHOUT Token

```bash
curl -X GET http://localhost:8000/users
```

**Expected Response (401 Unauthorized):**
```json
{
  "message": "Unauthorized",
  "error": "Missing or invalid JWT token"
}
```

---

### Test 4: Access Protected Route WITH Valid Token

```bash
# Store token from login response
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://localhost:8000/users \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": [...]
}
```

---

### Test 5: Access with Expired Token

```bash
# Use an expired token
curl -X GET http://localhost:8000/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired..."
```

**Expected Response (401 Unauthorized):**
```json
{
  "message": "Unauthorized",
  "error": "Token has expired"
}
```

---

### Test 6: Access with Invalid Signature

```bash
# Use a token with tampered signature
curl -X GET http://localhost:8000/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid_signature"
```

**Expected Response (401 Unauthorized):**
```json
{
  "message": "Unauthorized",
  "error": "Invalid token signature"
}
```

---

### Test 7: Rate Limiting on Login

```bash
# Execute 6 login requests rapidly
for i in {1..6}; do
  echo "Request $i:"
  curl -X POST http://localhost:8000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@test.com", "password": "wrong"}' \
    -w "\nHTTP Status: %{http_code}\n\n"
done
```

**Expected Response (6th request - 429 Too Many Requests):**
```json
{
  "message": "Too many login attempts. Please try again later."
}
```

---

### Test 8: CORS Preflight Request

```bash
curl -X OPTIONS http://localhost:8000/auth/login \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type" \
  -v
```

**Expected Headers:**
```
< Access-Control-Allow-Origin: http://localhost:3000
< Access-Control-Allow-Credentials: true
< Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
< Access-Control-Allow-Headers: Authorization, Content-Type, X-User-ID, X-User-Role
```

---

### Test 9: Identity Headers Forwarding

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://localhost:8000/users \
  -H "Authorization: Bearer $TOKEN" \
  -v 2>&1 | grep -E "X-User-"
```

**Expected:** IAM service receives headers:
- `X-User-ID`: User's subject ID from JWT
- `X-User-Role`: User's role from JWT
- `X-User-Permissions`: User's permissions from JWT

---

## Production Checklist

### Security

- [ ] Change `JWT_SECRET_KEY` to a cryptographically secure random value (min 32 chars)
- [ ] Change default `SUPER_ADMIN_PASSWORD`
- [ ] Enable HTTPS/TLS termination (use reverse proxy like nginx or cloud LB)
- [ ] Restrict Kong Admin API to internal network only
- [ ] Enable Kong audit logging
- [ ] Set up SSL certificates for production domain

### Monitoring

- [ ] Configure health check endpoint monitoring
- [ ] Set up log aggregation (ELK, Splunk, etc.)
- [ ] Configure alerting for 4xx/5xx error rates
- [ ] Monitor rate limit hits

### Performance

- [ ] Tune Kong worker processes based on CPU cores
- [ ] Configure connection pooling for upstream services
- [ ] Set appropriate timeouts based on SLA requirements
- [ ] Enable Kong caching if needed

### Backup & Recovery

- [ ] Backup `kong.yml` configuration
- [ ] Document rollback procedures
- [ ] Test disaster recovery plan

---

## Troubleshooting

### Kong fails to start

```bash
# Check configuration syntax
docker-compose -f docker-compose.yaml run --rm kong kong check /usr/local/kong/declarative/kong.yml

# View logs
docker-compose logs kong
```

### JWT validation fails

1. Verify `JWT_SECRET_KEY` matches in both Kong and IAM service
2. Check token algorithm is HS256
3. Ensure token is not expired
4. Verify Authorization header format: `Bearer <token>`

### Rate limiting not working

```bash
# Check plugin configuration
curl http://localhost:8001/routes/auth-login/plugins

# Verify rate limit policy
docker-compose -f docker-compose.yaml exec kong kong config -c /usr/local/kong/declarative/kong.yml
```

### CORS errors

1. Verify `FRONTEND_URL` in `.env` matches your frontend origin
2. Check browser console for specific CORS error
3. Ensure preflight requests are allowed

### Connection refused to IAM service

```bash
# Check IAM service health
docker-compose -f docker-compose.yaml ps iam-service
docker-compose -f docker-compose.yaml logs iam-service

# Test internal connectivity
docker-compose -f docker-compose.yaml exec kong wget -qO- http://iam-service:8081/health
```

---

## Admin API Reference

Kong Admin API is bound to `localhost:8001` (internal only).

### Get Configuration

```bash
curl http://localhost:8001/config
```

### Get All Routes

```bash
curl http://localhost:8001/routes
```

### Get All Plugins

```bash
curl http://localhost:8001/plugins
```

### Get Consumer Details

```bash
curl http://localhost:8001/consumers/iam-client
```

### Reload Configuration

```bash
# Kong automatically reloads when kong.yml changes
# Or trigger manually:
curl -X POST http://localhost:8001/config/reload
```

---

## File Structure

```
gradeloop-core-v2/
├── docker-compose.yaml     # Main Docker Compose configuration
├── kong.yml                # Kong declarative configuration
├── .env                    # Environment variables (gitignored)
├── .env.example            # Environment template
├── scripts/
│   └── test-kong.sh        # Automated test script
└── docs/
    └── KONG_SETUP.md       # This file
```

---

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Review Kong documentation: https://docs.konghq.com/
3. Check project CONTRIBUTING.md
