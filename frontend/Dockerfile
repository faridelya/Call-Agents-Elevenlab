# syntax=docker/dockerfile:1.7
# ── Stage 1: install dependencies ────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm cache persists across builds so `npm ci` is a cache-hit when lockfile unchanged
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ── Stage 2: build Next.js app ───────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_ vars are inlined at build time — pass via docker-compose build.args
ARG NEXT_PUBLIC_API_URL=http://localhost:8001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Stage 3: lean runtime image ──────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Custom server (server.ts) + Next.js output + all node_modules needed by tsx
COPY --from=builder /app/node_modules    ./node_modules
COPY --from=builder /app/.next           ./.next
COPY --from=builder /app/public          ./public
COPY --from=builder /app/package.json    ./package.json
COPY --from=builder /app/server.ts       ./server.ts
COPY --from=builder /app/lib             ./lib
COPY --from=builder /app/next.config.ts  ./next.config.ts
COPY --from=builder /app/tsconfig.json   ./tsconfig.json

EXPOSE 3742

HEALTHCHECK --interval=20s --timeout=5s --start-period=45s --retries=3 \
    CMD wget -qO- http://localhost:3742/api/health 2>/dev/null || wget -qO- http://localhost:3742/ || exit 1

CMD ["npm", "run", "start"]
