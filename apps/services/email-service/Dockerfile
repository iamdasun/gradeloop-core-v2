# =============================================================================
# Email Service - Optimized Dockerfile
# Target Image Size: <25MB
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM golang:1.25.6-alpine3.20 AS builder

WORKDIR /app

# Install git for module fetching
RUN apk add --no-cache git ca-certificates

# Cache Go modules - layer cached if go.mod/go.sum unchanged
COPY go.mod go.sum ./
RUN go mod download

# Copy only necessary source files
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY pkg/ ./pkg/

# Build static binary with stripped symbols
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -buildid=" \
    -trimpath \
    -o email-service \
    ./cmd/api

# -----------------------------------------------------------------------------
# Stage 2: Development
# -----------------------------------------------------------------------------
FROM builder AS dev
RUN go install github.com/air-verse/air@latest
CMD ["air"]

# -----------------------------------------------------------------------------
# Stage 3: Production Runtime - Distroless
# -----------------------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot AS production

WORKDIR /app

# Copy CA certificates for HTTPS/SMTP
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy compiled binary
COPY --from=builder /app/email-service .

# Use non-root user
USER 65532:65532

# Expose API port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/app/email-service", "health"]

# Set environment for binding to all interfaces
ENV HOST=0.0.0.0

CMD ["./email-service"]
