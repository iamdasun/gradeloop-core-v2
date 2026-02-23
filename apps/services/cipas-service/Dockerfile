# gradeloop-core-v2/apps/services/cipas-service/Dockerfile
#
# Multi-stage build for CIPAS (async-first FastAPI service)
# - Builder stage creates a virtualenv and installs dependencies with Poetry.
# - Final stage copies the venv and application code and runs as a non-root user.
#
# Notes:
# - This Dockerfile expects `pyproject.toml` (and optionally `poetry.lock`) at the build context root.
# - The application package is located under `src/` and exposes `cipas.main:app`.
# - The container runs Uvicorn (uvicorn[standard]) in the foreground.
# - Environment variables for runtime configuration (CIPAS_*) should be provided by the orchestrator.
#
# Example build:
#   docker build -t cipas-service:latest -f Dockerfile .
#
# Example run:
#   docker run --rm -p 8000:8000 cipas-service:latest

################################################################################
# Builder: install system deps, create venv, install project dependencies
################################################################################
FROM python:3.11-slim AS builder

# Keep image lean and reproducible
ARG POETRY_VERSION=1.5.1
ENV POETRY_VERSION=${POETRY_VERSION}
ENV VENV_PATH=/opt/venv
ENV PATH="${VENV_PATH}/bin:$PATH"

# Install minimal build dependencies for wheels and git if needed.
# Use --no-install-recommends to limit package bloat.
RUN set -eux; \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create an isolated virtual environment for predictable runtime artifacts.
RUN python -m venv ${VENV_PATH} && \
    ${VENV_PATH}/bin/python -m pip install --upgrade pip setuptools wheel

# Install Poetry into the venv so we can reliably install dependencies.
RUN pip install "poetry==${POETRY_VERSION}"

WORKDIR /app

# Copy pyproject (and lock file if present) before installing dependencies
# to leverage Docker layer caching when dependencies do not change.
COPY pyproject.toml poetry.lock* /app/

# Configure Poetry to install into the pre-created venv and avoid creating another venv.
# Then install only production dependencies.
RUN set -eux; \
    poetry config virtualenvs.create false --local; \
    # Install without dev deps, no-interaction, no-ansi for CI friendliness
    poetry install --no-root --no-dev --no-interaction --no-ansi

# Copy application source code after deps to take advantage of layer caching.
COPY src /app/src
COPY README.md /app/README.md

################################################################################
# Runtime: minimal image, non-root user, copy venv + app
################################################################################
FROM python:3.11-slim AS runtime

# Create a dedicated user to run the service (non-root).
# Use system user/group to keep the image small.
ARG APP_USER=cipas
ARG APP_GROUP=cipas
ARG APP_HOME=/app
ENV VENV_PATH=/opt/venv
ENV PATH="${VENV_PATH}/bin:$PATH"
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

# Create group and user (system account, no password)
RUN set -eux; \
    groupadd --system ${APP_GROUP} || true && \
    useradd --system --gid ${APP_GROUP} --home-dir ${APP_HOME} --create-home --shell /usr/sbin/nologin ${APP_USER} || true

# Copy venv from builder for all installed dependencies
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY --from=builder /app/src /app/src
COPY --from=builder /app/README.md /app/README.md
COPY pyproject.toml /app/pyproject.toml

WORKDIR /app

# Ensure the non-root user owns the application files and venv
RUN set -eux; \
    chown -R ${APP_USER}:${APP_GROUP} /app /opt/venv

# Switch to unprivileged user
USER ${APP_USER}

# Expose the HTTP port used by Uvicorn
EXPOSE 8000

# Default environment variables (override at runtime)
ENV HOST=0.0.0.0
ENV PORT=8000
ENV UVICORN_WORKERS=1

# Run Uvicorn with the app. Use uvloop/httptools (installed via uvicorn[standard]) when available.
# We deliberately avoid running with many workers to keep resource usage predictable in small containers;
# orchestration can scale using multiple replicas.
CMD ["uvicorn", "cipas.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "uvloop", "--http", "httptools", "--workers", "1"]
