FROM node:23-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Copy package.json files for the monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/

# Install dependencies
RUN corepack enable
RUN pnpm install --filter backend --frozen-lockfile

# Copy backend files maintaining monorepo structure
COPY --chown=node:node apps/backend/package.json ./apps/backend/
# Copy backend package.json to root for ESM import map resolution
COPY --chown=node:node apps/backend/package.json ./package.json
COPY --chown=node:node apps/backend/src ./apps/backend/src

# Set working directory to backend app (like production)
WORKDIR /app/apps/backend

# Create analyses storage directories  
USER root
RUN mkdir -p /app/apps/backend/analyses-storage/analyses \
   /app/apps/backend/analyses-storage/config \
   && chown -R node:node /app/apps/backend/analyses-storage

# Set development environment
ENV NODE_ENV=development

USER node
EXPOSE 3000
# Start in development mode using Node.js built-in --watch from backend directory
CMD ["node", "--watch", "src/server.js"]