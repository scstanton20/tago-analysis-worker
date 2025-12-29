FROM node:23-alpine@sha256:a34e14ef1df25b58258956049ab5a71ea7f0d498e41d0b514f4b8de09af09456 AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Copy package.json files for the monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/

COPY packages/types/package.json ./packages/types/

RUN corepack enable

# Use BuildKit cache mount for pnpm store - persists across builds
RUN --mount=type=cache,id=pnpm-$TARGETPLATFORM,target=/pnpm/store \
    pnpm install --filter backend --filter @tago-analysis-worker/types --frozen-lockfile

# Copy pre-built shared types package (built by CI before Docker)
COPY packages/types/dist ./packages/types/dist

FROM node:23-alpine@sha256:a34e14ef1df25b58258956049ab5a71ea7f0d498e41d0b514f4b8de09af09456 AS run

# Install openssl for certificate generation
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files for Node.js module resolution
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/backend/package.json ./apps/backend/
COPY --chown=node:node packages/types/package.json ./packages/types/
# Copy backend package.json to root for ESM import map resolution
COPY --chown=node:node apps/backend/package.json ./package.json

# Copy dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules

# Copy built shared types package
COPY --from=deps /app/packages/types/dist ./packages/types/dist

# Copy source code
COPY --chown=node:node apps/backend/src ./apps/backend/src

# Set working directory to backend app (like development)
WORKDIR /app/apps/backend

USER root

# Generate self-signed SSL certificates for backend
RUN mkdir -p /app/certs && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /app/certs/backend.key \
    -out /app/certs/backend.crt \
    -subj "/C=US/ST=Florida/L=Orlando/O=Tago Analysis Worker/CN=backend" \
    -addext "subjectAltName=DNS:backend,DNS:localhost,IP:127.0.0.1" && \
    chmod 644 /app/certs/backend.crt && \
    chmod 600 /app/certs/backend.key

RUN mkdir -p /app/apps/backend/analyses-storage/analyses \
   /app/apps/backend/analyses-storage/config \
   && chown -R node:node /app/apps/backend/analyses-storage /app/certs

ENV NODE_ENV=production
ENV CERT_FILE=/app/certs/backend.crt
ENV CERT_KEYFILE=/app/certs/backend.key

VOLUME [ "/app/apps/backend/analyses-storage" ]

USER node
EXPOSE 3443
# Start in production mode from backend directory
CMD ["node", "src/server.ts"]