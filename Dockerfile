# syntax=docker/dockerfile:1.7

# --- Web builder stage: build the SPA (React + Vite) ---
#
# Фронтенд собирается в отдельной стадии: у него свой workspace, свой
# lockfile и свой toolchain (см. AGENTS.md rule #10). В runtime-образ попадает
# только готовый `web/dist` — он отдаётся тем же сервисом, что и API
# (см. ADR-0006).
FROM node:22-bookworm-slim AS web-builder
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/tsconfig.json web/tsconfig.node.json web/vite.config.ts web/index.html ./
COPY web/postcss.config.js web/tailwind.config.js ./
COPY web/src ./src
# Тесты (`web/tests`) в контекст образа не попадают (см. `.dockerignore`),
# поэтому `tsc -p tsconfig.json` проверяет только `src` — полный typecheck
# фронтенда живёт в CI (`mise run check`).
RUN npm run build

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

# Compiled SPA from the web builder stage. Путь `/app/web/dist` — тот, что
# ищет `defaultStaticRoot()` (см. `src/static-ui.ts`).
COPY --from=web-builder /app/web/dist ./web/dist

# Run as the unprivileged `node` user (uid 1000) that ships with the base
# image instead of root. The app only reads /app (no file writes at runtime —
# the store is in-memory), so the root-owned COPY'ed files stay readable
# without a chown pass.
USER node

EXPOSE $PORT

# Exec form → PID 1 = node, so `docker stop` sends SIGTERM to node directly
# and Fastify hooks run for graceful shutdown.
CMD ["node", "dist/server.js"]
