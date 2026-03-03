# =============================================================================
# CIPAS Service - Optimized Dockerfile
# Target Image Size: <150MB
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM python:3.14-slim AS builder

WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies (removed in runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for layer caching
COPY pyproject.toml ./

# Install dependencies directly with pip
RUN pip install --no-cache-dir -e ".[main]"

# Copy application code (layer invalidated on code change)
COPY main.py routes.py schemas.py ./
COPY clone_detection/ ./clone_detection/
COPY scripts/ ./scripts/

# Build tree-sitter parsers
RUN python scripts/build_parsers.py 2>/dev/null || true

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime
# -----------------------------------------------------------------------------
FROM python:3.14-slim AS production

WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.14/site-packages /usr/local/lib/python3.14/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY --from=builder /app/main.py /app/routes.py /app/schemas.py ./
COPY --from=builder /app/clone_detection ./clone_detection
COPY --from=builder /app/scripts ./scripts

# Create non-root user for security
RUN useradd --create-home --uid 1000 cipas-service \
    && chown -R cipas-service:cipas-service /app

USER cipas-service

# Expose port
EXPOSE 8085

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8085/health || exit 1

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8085", "--workers", "1"]

# -----------------------------------------------------------------------------
# Stage 3: Development (optional)
# -----------------------------------------------------------------------------
FROM builder AS development

WORKDIR /app

# Install dev dependencies
RUN pip install --no-cache-dir -e ".[dev]" 2>/dev/null || pip install --no-cache-dir -e "."

# Copy application code
COPY main.py routes.py schemas.py ./
COPY clone_detection/ ./clone_detection/
COPY scripts/ ./scripts/

# Expose port
EXPOSE 8085

# Run with reload
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8085", "--reload"]
