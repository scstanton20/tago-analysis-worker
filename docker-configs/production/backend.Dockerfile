# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Copy package.json files for the monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/types/package.json ./packages/types/

# Install production dependencies only and deploy to isolated directory
RUN corepack enable && \
    pnpm install --frozen-lockfile && \
    pnpm --filter backend deploy --prod /deploy

# Copy pre-built shared types package (built by CI before Docker)
COPY packages/types/dist /deploy/node_modules/@tago-analysis-worker/types/dist

# Copy backend source code to deploy directory
COPY apps/backend/src /deploy/src

FROM node:24-alpine AS run

# Install openssl for certificate generation
RUN apk add --no-cache openssl

WORKDIR /app

# Copy the pruned deployment from deps stage (production deps only)
COPY --from=deps --chown=node:node /deploy ./

USER root

# Generate SSL certificates and create storage directories in single layer
RUN mkdir -p /app/certs /app/analyses-storage/analyses /app/analyses-storage/config && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /app/certs/backend.key \
    -out /app/certs/backend.crt \
    -subj "/C=US/ST=Florida/L=Orlando/O=Tago Analysis Worker/CN=backend" \
    -addext "subjectAltName=DNS:backend,DNS:localhost,IP:127.0.0.1" && \
    chmod 644 /app/certs/backend.crt && \
    chmod 600 /app/certs/backend.key && \
    chown -R node:node /app/analyses-storage /app/certs

ENV NODE_ENV=production
ENV CERT_FILE=/app/certs/backend.crt
ENV CERT_KEYFILE=/app/certs/backend.key

VOLUME [ "/app/analyses-storage" ]

USER node
EXPOSE 3443
# Start in production mode
CMD ["node", "src/server.ts"]
