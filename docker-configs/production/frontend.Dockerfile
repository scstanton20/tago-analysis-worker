# syntax=docker/dockerfile:1

FROM node:24.3-alpine AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Copy only package files first for better layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/types/package.json ./packages/types/

# Install all dependencies and deploy to isolated directory
RUN corepack enable && \
    pnpm install --frozen-lockfile && \
    pnpm --filter frontend deploy /deploy

# Stage 2: Build the frontend
FROM node:24.3-alpine AS build

WORKDIR /deploy

# Copy deployed dependencies (pruned, frontend-only ~320MB vs 865MB root)
COPY --from=deps /deploy ./

# Copy frontend source code
COPY apps/frontend/src ./src
COPY apps/frontend/public ./public
COPY apps/frontend/index.html ./
COPY apps/frontend/vite.config.ts ./
COPY apps/frontend/postcss.config.js ./
COPY apps/frontend/tsconfig.json ./

# Copy pre-built shared types package (built by CI before Docker)
COPY packages/types/dist ./node_modules/@tago-analysis-worker/types/dist

# Copy tsconfig.base.json for TypeScript resolution
COPY tsconfig.base.json ./

# Build for production
ENV NODE_ENV=production
RUN npx vite build

# Production stage - nginx-unprivileged runs as non-root by default (uid 101)
FROM nginxinc/nginx-unprivileged:alpine AS frontend

# Switch to root temporarily to install openssl and generate certs
USER root

# Install dependencies for certificate generation and environment substitution
RUN apk add --no-cache openssl gettext && \
    mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/certs/tago-worker.key \
    -out /etc/nginx/certs/tago-worker.crt \
    -subj "/C=US/ST=Florida/L=Orlando/O=Tago Analysis Worker/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:frontend,IP:127.0.0.1" && \
    chmod 644 /etc/nginx/certs/tago-worker.crt && \
    chmod 640 /etc/nginx/certs/tago-worker.key && \
    chown -R nginx:nginx /etc/nginx/certs

WORKDIR /app

# Copy built frontend files to nginx (owned by nginx)
COPY --from=build --chown=nginx:nginx /deploy/dist /usr/share/nginx/html

# Copy nginx configuration template and entrypoint script
COPY --chown=nginx:nginx docker-configs/production/nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY --chown=root:root docker-configs/production/nginx-entrypoint.sh /usr/local/bin/nginx-entrypoint.sh
RUN chmod +x /usr/local/bin/nginx-entrypoint.sh

# Set default environment variables for certificate paths
ENV NGINX_CERT_FILE=/etc/nginx/certs/tago-worker.crt
ENV NGINX_CERT_KEYFILE=/etc/nginx/certs/tago-worker.key

# Switch back to non-root user (nginx, uid 101)
USER nginx

# Expose unprivileged HTTPS port
EXPOSE 8443

# Use entrypoint script to configure nginx with environment variables
ENTRYPOINT ["/usr/local/bin/nginx-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
