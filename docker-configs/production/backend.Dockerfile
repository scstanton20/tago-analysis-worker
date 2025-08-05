FROM node:23-alpine

WORKDIR /app

# Copy package files
COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node node_modules ./node_modules

# Copy source code
COPY --chown=node:node src ./src

# Create storage directories
USER root
RUN mkdir -p /app/analyses-storage/analyses \
   /app/analyses-storage/config \
   && chown -R node:node /app/analyses-storage

ENV NODE_ENV=production

VOLUME [ "/app/analyses-storage" ]

USER node
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]
