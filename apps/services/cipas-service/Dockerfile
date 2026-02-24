# =============================================================================
# CIPAS — Code Integrity Analysis Service
# Multi-stage Dockerfile
#
# Stage 1 (builder): installs system build tools, creates /opt/venv,
#                    installs Poetry, installs production dependencies,
#                    copies application source.
#
# Stage 2 (runtime): minimal image, non-root user, copies venv + source,
#                    runs Uvicorn with uvloop + httptools.
#
# Key notes:
#   • tree-sitter-languages ships as a platform-specific wheel that bundles
#     pre-compiled grammar shared libraries (.so). The wheel links against
#     libstdc++ which is present in python:3.11-slim (Debian Bookworm).
#     No Node.js or tree-sitter CLI is needed at build or runtime.
#   • asyncpg contains a C extension; build-essential / gcc are required in
#     the builder stage only — they are NOT copied to the runtime image.
#   • The service listens on port 8085 to avoid collision with other services
#     in the Compose network (Uvicorn default 8000 is taken by Traefik).
#   • UVICORN_WORKERS is intentionally 1. Scale via container replicas, not
#     in-process forking, so each replica gets a clean ProcessPoolExecutor.
#
# Build:
#   docker build -t cipas-service:local -f Dockerfile .
#
# Run (minimal):
#   docker run --rm -p 8085:8085 \
#     -e CIPAS_DATABASE_URL=postgresql://cipas:secret@host:5432/cipas_db \
#     cipas-service:local
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — builder
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS builder

# Propagate build-time Poetry version arg so it can be overridden in CI.
ARG POETRY_VERSION=1.8.3

ENV POETRY_VERSION=${POETRY_VERSION} \
    VENV_PATH=/opt/venv \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1 \
    POETRY_NO_ANSI=1

# ── System build dependencies ────────────────────────────────────────────────
# build-essential / gcc:  needed to compile asyncpg's C extension.
# libpq-dev:              asyncpg links against libpq at runtime for SSL;
#                         the shared lib is copied into the venv by pip.
# ca-certificates, curl:  for downloading wheels and verifying TLS.
# git:                    some Poetry VCS sources require it.
#
# NOT included: nodejs, npm, tree-sitter CLI — not required because
# tree-sitter-languages ships pre-compiled grammar .so files in its wheel.
RUN set -eux; \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# ── Virtual environment ───────────────────────────────────────────────────────
RUN python -m venv ${VENV_PATH} && \
    ${VENV_PATH}/bin/pip install --upgrade pip setuptools wheel

# VIRTUAL_ENV must be set explicitly so that Poetry (running with
# POETRY_VIRTUALENVS_CREATE=false) recognises /opt/venv as the active
# environment and installs packages there — not into system site-packages.
# Without this, `poetry install` silently targets /usr/local/lib/pythonX.Y
# and the COPY in the runtime stage picks up an empty /opt/venv.
ENV PATH="/opt/venv/bin:$PATH" \
    VIRTUAL_ENV=/opt/venv

# ── Poetry ───────────────────────────────────────────────────────────────────
RUN pip install "poetry==${POETRY_VERSION}"

WORKDIR /build

# ── Dependency installation ───────────────────────────────────────────────────
# Copy lock files first to maximise Docker layer cache reuse.
# When only source code changes (not deps), this layer is not invalidated.
COPY pyproject.toml poetry.lock* /build/

# Install only production deps into the venv.
# --only main       → skip dev group (pytest, ruff, mypy, etc.)
# --no-root         → do not install the cipas package itself yet
#                     (we copy src/ separately to keep the layer clean)
RUN poetry install --only main --no-root --no-interaction --no-ansi

# ── Application source ────────────────────────────────────────────────────────
# Copied after dependency installation so that source-only changes do not
# invalidate the (expensive) dependency layer above.
COPY src/ /build/src/
COPY README.md /build/README.md

# Install the cipas package itself (editable-equivalent for the venv).
# This registers the `cipas` package so `from cipas.xxx import yyy` resolves.
RUN poetry install --only main --no-interaction --no-ansi

# -----------------------------------------------------------------------------
# Stage 2 — runtime
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

# ── Labels ────────────────────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="cipas-service" \
    org.opencontainers.image.description="CIPAS — Code Integrity Analysis Service" \
    org.opencontainers.image.vendor="GradeLoop" \
    org.opencontainers.image.source="https://github.com/gradeloop/gradeloop-core-v2"

# ── Runtime system dependencies ───────────────────────────────────────────────
# libpq5:       asyncpg runtime dependency (PostgreSQL client library).
# libstdc++6:   tree-sitter-languages pre-compiled .so files link against it.
#               Present in python:3.11-slim (Debian Bookworm libstdc++6 ≥ 12).
# ca-certificates: TLS verification for outbound HTTPS (healthchecks, OTel).
RUN set -eux; \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    libpq5 \
    libstdc++6 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Non-root user ─────────────────────────────────────────────────────────────
ARG APP_USER=cipas
ARG APP_GROUP=cipas
ARG APP_HOME=/app

RUN set -eux; \
    groupadd --system ${APP_GROUP} && \
    useradd  --system \
    --gid ${APP_GROUP} \
    --home-dir ${APP_HOME} \
    --create-home \
    --shell /usr/sbin/nologin \
    ${APP_USER}

# ── Copy venv and application from builder ────────────────────────────────────
ENV VENV_PATH=/opt/venv
COPY --from=builder --chown=${APP_USER}:${APP_GROUP} /opt/venv     /opt/venv
COPY --from=builder --chown=${APP_USER}:${APP_GROUP} /build/src    /app/src
COPY --from=builder --chown=${APP_USER}:${APP_GROUP} /build/README.md /app/README.md
COPY --chown=${APP_USER}:${APP_GROUP} pyproject.toml /app/pyproject.toml

WORKDIR /app

# ── Environment ───────────────────────────────────────────────────────────────
# PATH is set in its own instruction — no variable indirection, no inline
# comments — to guarantee the venv bin dir is always resolved correctly by
# both BuildKit's layer cache and the OCI runtime at container startup.
ENV PATH="/opt/venv/bin:$PATH"

ENV PYTHONPATH=/app/src \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CIPAS_ENV=production \
    CIPAS_LOG_LEVEL=INFO \
    CIPAS_PORT=8085 \
    CIPAS_HOST=0.0.0.0 \
    UVICORN_WORKERS=1

# ── Ownership ─────────────────────────────────────────────────────────────────
RUN chown -R ${APP_USER}:${APP_GROUP} /app /opt/venv

USER ${APP_USER}

# ── Port ──────────────────────────────────────────────────────────────────────
# 8085: CIPAS HTTP port.
# Port 8000 is reserved for Traefik in the Compose network.
EXPOSE 8085

# ── Healthcheck ───────────────────────────────────────────────────────────────
# Performed by Docker / Compose before the service is declared healthy.
# Uses curl against the liveness endpoint; tolerates 5s startup grace.
HEALTHCHECK \
    --interval=15s \
    --timeout=5s \
    --retries=5 \
    --start-period=20s \
    CMD curl -f http://localhost:8085/api/v1/cipas/health || exit 1

# ── Entrypoint ────────────────────────────────────────────────────────────────
# uvloop:     faster event loop (C implementation of asyncio).
# httptools:  faster HTTP/1.1 request parser (C implementation).
# workers 1:  single worker per container; replicas handle horizontal scale.
# access-log: disabled in production to reduce log volume and I/O pressure.
#             Structured request logs are emitted by the FastAPI middleware instead.
# Use the absolute path to the venv's uvicorn binary so the OCI runtime
# never needs to consult PATH for the entrypoint executable. This is the
# safest form and works even if PATH lookup is unavailable at container init.
CMD ["/opt/venv/bin/uvicorn", "cipas.main:app", \
    "--host", "0.0.0.0", \
    "--port", "8085", \
    "--loop", "uvloop", \
    "--http", "httptools", \
    "--workers", "1", \
    "--no-access-log"]
