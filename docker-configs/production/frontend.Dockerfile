FROM node:23-alpine AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Copy package.json files for the monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/frontend/package.json ./apps/frontend/

# Install dependencies
RUN corepack enable
RUN pnpm install --filter frontend --frozen-lockfile

FROM node:23-alpine AS build
# Set up pnpm in the runtime container
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Set working directory to frontend app
WORKDIR /app

# Copy the package files needed for pnpm to run correctly
COPY --chown=nginx:nginx package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=nginx:nginx apps/frontend/package.json ./apps/frontend/

# Copy dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules

# Copy source code
COPY --chown=nginx:nginx apps/frontend ./apps/frontend

# Set production environment
ENV NODE_ENV=production

# Install corepack
RUN corepack enable

# Build for production
WORKDIR /app/apps/frontend
RUN pnpm build

# Production stage - Frontend
FROM nginx:alpine AS frontend

# Install dependencies for certificate generation and environment substitution
RUN apk add --no-cache openssl gettext

WORKDIR /app

# Generate self-signed SSL certificates
RUN openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/ssl/private/tago-worker.key \
    -out /etc/ssl/certs/tago-worker.crt \
    -subj "/C=US/ST=Florida/L=Orlando/O=Tago Analysis Worker/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:frontend,IP:127.0.0.1" && \
    chmod 644 /etc/ssl/certs/tago-worker.crt && \
    chmod 600 /etc/ssl/private/tago-worker.key && \
    chown nginx:nginx /etc/ssl/certs/tago-worker.crt /etc/ssl/private/tago-worker.key

# Copy built frontend files to nginx
COPY --from=build --chown=nginx:nginx /app/apps/frontend/dist /usr/share/nginx/html

# Copy nginx configuration template and entrypoint script
COPY --chown=nginx:nginx docker-configs/production/nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY --chown=root:root docker-configs/production/nginx-entrypoint.sh /usr/local/bin/nginx-entrypoint.sh
RUN chmod +x /usr/local/bin/nginx-entrypoint.sh

# Set default environment variables for certificate paths
ENV NGINX_CERT_FILE=/etc/ssl/certs/tago-worker.crt
ENV NGINX_CERT_KEYFILE=/etc/ssl/private/tago-worker.key

# Expose HTTPS port only in production
EXPOSE 443

# Use entrypoint script to configure nginx with environment variables
ENTRYPOINT ["/usr/local/bin/nginx-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]