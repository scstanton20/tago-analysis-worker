FROM node:22-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy package.json files for the monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Set working directory to frontend app
WORKDIR /app/apps/frontend

# Set development environment
ENV NODE_ENV=development

# Start in development mode
CMD ["pnpm", "dev"]