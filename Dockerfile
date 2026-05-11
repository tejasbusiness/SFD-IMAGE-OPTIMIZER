# ── Stage 1: Install production dependencies ─────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./

# Install only production deps; sharp will pull its prebuilt binary here
RUN npm ci --omit=dev

# ── Stage 2: Lean production image ───────────────────────────────────────────
FROM node:22-slim AS production

# node:22-slim ships with glibc — no extra libvips needed for sharp's
# prebuilt binaries (sharp >= 0.31 bundles its own libvips statically).
# If you see "libvips not found" errors at runtime, uncomment the block below:
# RUN apt-get update && apt-get install -y --no-install-recommends libvips42 \
#     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pull in dependencies from the builder stage (keeps final image small)
COPY --from=builder /app/node_modules ./node_modules

# Copy application source (node_modules excluded via .dockerignore)
COPY . .

# Create the upload dir and hand ownership to the built-in non-root user
RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 3000

# Lightweight HTTP probe — relies on the /health endpoint added to server.js
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
