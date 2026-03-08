# =============================================================================
# CIPAS Semantics Service - Optimized Dockerfile
# Target Image Size: <150MB
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for layer caching
COPY pyproject.toml ./

# Install dependencies directly (package-mode = false in pyproject.toml)
RUN pip install \
    fastapi \
    uvicorn \
    pydantic \
    tree-sitter \
    tree-sitter-java \
    tree-sitter-c \
    tree-sitter-c-sharp \
    tree-sitter-python \
    scikit-learn \
    xgboost \
    pandas \
    numpy \
    rapidfuzz \
    matplotlib \
    seaborn \
    plotly \
    tqdm

# Copy application code
COPY main.py routes.py schemas.py ./
COPY clone_detection/ ./clone_detection/

# Verify tree-sitter tokenizer installation
RUN python -c "from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer; TreeSitterTokenizer(); print('Tree-sitter parsers loaded successfully')" 2>/dev/null || true

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS production

WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY --from=builder /app/main.py /app/routes.py /app/schemas.py ./
COPY --from=builder /app/clone_detection ./clone_detection

# Create models directory and non-root user
RUN mkdir -p /app/models \
    && useradd --create-home --uid 1000 cipas-semantics \
    && chown -R cipas-semantics:cipas-semantics /app

USER cipas-semantics

# Expose port
EXPOSE 8087

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8087/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8087", "--workers", "1"]

# -----------------------------------------------------------------------------
# Stage 3: Development
# -----------------------------------------------------------------------------
FROM builder AS development

WORKDIR /app

# Install dev dependencies
RUN pip install pytest 2>/dev/null || true

COPY main.py routes.py schemas.py ./
COPY clone_detection/ ./clone_detection/

EXPOSE 8087

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8087", "--reload"]
