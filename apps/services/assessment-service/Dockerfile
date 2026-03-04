# =============================================================================
# Assessment Service - Optimized Dockerfile
# Target Image Size: <25MB
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install git for module fetching
RUN apk add --no-cache git ca-certificates

# Cache Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy only necessary source files
COPY cmd/ ./cmd/
COPY internal/ ./internal/

# Build static binary with stripped symbols
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -buildid=" \
    -trimpath \
    -o assessment-service \
    ./cmd/main.go

# -----------------------------------------------------------------------------
# Stage 2: Development
# -----------------------------------------------------------------------------
FROM builder AS dev
RUN go install github.com/air-verse/air@latest
# Use -mod=mod to ignore vendor directory during development
ENV GOFLAGS="-mod=mod"
CMD ["air"]

# -----------------------------------------------------------------------------
# Stage 3: Production Runtime - Distroless
# -----------------------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot AS production

WORKDIR /app

# Copy CA certificates and timezone data
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy compiled binary
COPY --from=builder /app/assessment-service .

# Use non-root user
USER 65532:65532

# Expose API port
EXPOSE 8084

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/app/assessment-service", "health"]

# Set environment for binding to all interfaces
ENV HOST=0.0.0.0

CMD ["./assessment-service"]
