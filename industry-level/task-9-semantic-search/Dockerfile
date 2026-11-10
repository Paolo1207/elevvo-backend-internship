# syntax=docker/dockerfile:1

# Debian ("bookworm-slim") instead of Alpine: the ONNX runtime used by the embedding model needs glibc.

# ---------- Stage 1: builder (compiles TypeScript, also used by the one-off `migrate` service) ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
# Do not download the GPU (CUDA) binaries of onnxruntime. They are huge and unused here.
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

# ---------- Stage 2: runner (production dependencies + compiled JavaScript) ----------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip \
    MODEL_CACHE_DIR=/app/.model-cache
WORKDIR /app

COPY package.json package-lock.json ./
# NOTE: no --omit=optional here (unlike Task 7). The embedding library needs `sharp`, which is an optional dependency.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# The downloaded model (about 120 MB) is stored here. docker-compose mounts a volume on it, so it is downloaded only once.
RUN mkdir -p /app/.model-cache && chown -R node:node /app/.model-cache
USER node

EXPOSE 3000

# The slim image has no wget/curl, so the check uses Node itself.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
