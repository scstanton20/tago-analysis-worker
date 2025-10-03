FROM node:23-alpine AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Copy package.json files for the monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/

# Install dependencies
RUN corepack enable
RUN pnpm install --filter backend --frozen-lockfile --prod

FROM node:23-alpine AS run

# Install openssl for certificate generation
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files for Node.js module resolution
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/backend/package.json ./apps/backend/
# Copy backend package.json to root for ESM import map resolution
COPY --chown=node:node apps/backend/package.json ./package.json

# Copy dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules

# Copy source code
COPY --chown=node:node apps/backend/src ./apps/backend/src

# NODE_PATH not needed for ESM - analysis processes run with proper cwd

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
ENV CERT_PATH=/app/certs/backend.crt
ENV KEY_PATH=/app/certs/backend.key

VOLUME [ "/app/apps/backend/analyses-storage" ]

USER node
EXPOSE 3443
# Start in production mode from backend directory
CMD ["node", "src/server.js"]