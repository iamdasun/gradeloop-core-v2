# =============================================================================
# Web Frontend - Optimized Dockerfile (Next.js & Bun)
# Target: Small image size, fast build
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base image
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS base
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Install dependencies
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json bun.lock* ./
# We also copy any package.json inside apps or packages if using a monorepo
COPY apps/web/package.json ./apps/web/
# Install dependencies for the web app (install inside apps/web so `next` is available)
WORKDIR /app/apps/web
RUN bun install --frozen-lockfile
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 3: Builder
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# Set environment variables for production build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

WORKDIR /app/apps/web
# Build the Next.js application
RUN bun run build

# -----------------------------------------------------------------------------
# Stage 4: Production Runtime
# -----------------------------------------------------------------------------
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create a non-root user
RUN addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next && chown nextjs:bunjs .next

# Copy built assets
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:bunjs /app/apps/web/.next ./apps/web/.next

# Copy runtime package files and node_modules so `bun run start` works
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules

USER nextjs

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"

# Start the Next.js server using the package `start` script
# This avoids relying on a standalone `server.js` file being present.
WORKDIR /app/apps/web
CMD ["bun", "run", "start"]
