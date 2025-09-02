// config/default.js
import path from 'path';

function determineStorageBase() {
  // If explicitly set through environment variable, use that
  if (process.env.STORAGE_BASE) {
    return process.env.STORAGE_BASE;
  }

  // In both development and production, use analyses-storage relative to current working directory
  // - Development: cwd is apps/backend, so it becomes apps/backend/analyses-storage
  // - Production Docker: cwd is /app/apps/backend, so it becomes /app/apps/backend/analyses-storage
  return path.join(process.cwd(), 'analyses-storage');
}

const config = {
  env: process.env.NODE_ENV,
  secretKey:
    process.env.SECRET_KEY ||
    (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'SECRET_KEY environment variable is required in production!',
        );
      }
      // Use a consistent key for development to persist encrypted data across restarts
      console.warn(
        'Warning: Using consistent development SECRET_KEY. Set SECRET_KEY environment variable for production.',
      );
      return 'dev-secret-key-for-tago-analysis-runner-change-in-production';
    })(),
  storage: {
    base: determineStorageBase(),
    createDirs: true,
  },
  analysis: {
    maxLogsInMemory: 100,
    forceKillTimeout: 3000,
    autoRestartDelay: 1000,
  },
};

// Derive paths from base storage
config.paths = {
  analysis: path.join(config.storage.base, 'analyses'),
  config: path.join(config.storage.base, 'config'),
};

// Derived files
config.files = {
  config: path.join(config.paths.config, 'analyses-config.json'),
};

export default config;
