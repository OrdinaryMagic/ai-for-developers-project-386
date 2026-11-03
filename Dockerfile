# syntax=docker/dockerfile:1.7

# --- Builder stage: compile TypeScript to dist/ ---
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install full deps (devDependencies needed for tsc).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Bring in the TypeScript source and build.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: minimal image, prod deps only ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# HOST must bind 0.0.0.0 inside the container (override the dev default
# 127.0.0.1 in mise.toml). PORT is only a fallback — `docker run --env PORT=…`
# (and prod-deploy) win.
ENV HOST=0.0.0.0
ENV PORT=3000

# Prod deps only — no tsc / oxlint / oxfmt / vitest / playwright in the image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Compiled output from the builder stage.
COPY --from=builder /app/dist ./dist

EXPOSE $PORT

# Exec form → PID 1 = node, so `docker stop` sends SIGTERM to node directly
# and Fastify hooks run for graceful shutdown.
CMD ["node", "dist/server.js"]
