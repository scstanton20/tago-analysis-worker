// config/default.js
import crypto from 'crypto';
import path from 'path';

function determineStorageBase() {
  // If explicitly set through environment variable, use that
  if (process.env.STORAGE_BASE) {
    return process.env.STORAGE_BASE;
  }

  // For both Docker and local development, use a directory in the backend project
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
      // Generate a secure random secret for development instead of hardcoding
      console.warn(
        'Warning: Using auto-generated SECRET_KEY for development. Set SECRET_KEY environment variable.',
      );
      return crypto.randomBytes(32).toString('hex');
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
  process: {
    env: {
      NODE_PATH:
        process.env.NODE_PATH ||
        `${path.join(process.cwd(), '../node_modules')}:${path.join(process.cwd(), 'src')}`,
    },
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
