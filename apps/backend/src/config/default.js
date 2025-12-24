// config/default.js
import path from 'path';
import { ANALYSIS_PROCESS } from '../constants.js';
import { createChildLogger } from '../utils/logging/logger.js';

const configLogger = createChildLogger('config');

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
      configLogger.warn(
        'Using consistent development SECRET_KEY. Set SECRET_KEY environment variable for production.',
      );
      return 'dev-secret-key-for-tago-analysis-worker-change-in-production';
    })(),
  storage: {
    base: determineStorageBase(),
    createDirs: true,
  },
  analysis: {
    maxLogsInMemory: ANALYSIS_PROCESS.MAX_MEMORY_LOGS_DEFAULT,
    forceKillTimeout: ANALYSIS_PROCESS.FORCE_KILL_TIMEOUT_MS,
  },
  process: {
    // Defines a whitelist of environment variables from the parent process (this backend)
    // that will be passed to the forked analysis child process.
    // This is a security measure to prevent leaking sensitive backend environment
    // variables (like database URLs, API keys, etc.) to the analysis scripts.
    allowedParentEnv: [
      'PATH',
      'NODE_ENV',
      'TZ', // Timezone
      'LANG', // Language/locale
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'NO_PROXY',
      'DNS_CACHE_ENABLED',
      'DNS_CACHE_TTL',
      'DNS_CACHE_MAX_ENTRIES',
    ],
    // Additional environment variables to be set for the child process.
    // These will override any colliding variables from the parent environment.
    additionalEnv: {},
  },
  // Uses Node.js Permission Model (--permission) to restrict filesystem access
  sandbox: {
    // Enable/disable filesystem sandboxing (default: true in production, false in development)
    enabled: process.env.SANDBOX_ENABLED
      ? process.env.SANDBOX_ENABLED === 'true'
      : process.env.NODE_ENV === 'production',
    // Allow child processes to spawn their own children (disabled for security)
    allowChildProcess: false,
    // Allow worker threads (disabled - child uses logger without pino)
    allowWorkerThreads: false,
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

export { config };
