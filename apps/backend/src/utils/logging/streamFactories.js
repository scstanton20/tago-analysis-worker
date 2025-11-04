import pino from 'pino';
import { LokiTransport } from './lokiTransport.js';

/**
 * Parse Loki labels from environment variable
 * Format: key1=value1,key2=value2
 *
 * @param {string} labelString - Comma-separated key=value pairs
 * @returns {object} Parsed labels object
 */
export function parseLokiLabels(labelString) {
  if (!labelString) return {};

  try {
    const labels = {};
    labelString.split(',').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key && value) {
        labels[key.trim()] = value.trim();
      }
    });
    return labels;
  } catch (error) {
    console.error(`Error parsing Loki labels "${labelString}":`, error.message);
    return {};
  }
}

/**
 * Creates a console stream with pino-pretty formatting for development
 * or stdout for production/when Loki is enabled
 *
 * @param {string} env - Current environment (development/production)
 * @param {string[]} additionalIgnoreFields - Extra fields to hide from console
 * @returns {object} Pino stream configuration
 */
export function createConsoleStream(env, additionalIgnoreFields = []) {
  const ignoreFields = ['pid', 'hostname', ...additionalIgnoreFields];

  if (process.env.LOG_INCLUDE_MODULE !== 'true') {
    ignoreFields.push('module', 'analysis');
  }

  // Pretty output for local development (only when Loki is not configured)
  if (env === 'development' && !process.env.LOG_LOKI_URL) {
    return {
      level: process.env.LOG_LEVEL || 'debug',
      stream: pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: ignoreFields.join(','),
          messageFormat: '{msg}',
          errorLikeObjectKeys: ['err', 'error'],
        },
      }),
    };
  }

  // Standard output for production or when Loki is enabled
  return {
    level: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
    stream: process.stdout,
  };
}

/**
 * Creates a Loki transport stream for centralized logging
 *
 * @param {string} env - Current environment
 * @param {object} additionalLabels - Extra Loki labels to add
 * @returns {object|null} Loki stream or null if not configured
 */
export function createLokiStream(env, additionalLabels = {}) {
  if (!process.env.LOG_LOKI_URL) {
    return null;
  }

  try {
    const lokiOptions = {
      host: process.env.LOG_LOKI_URL,
      basicAuth:
        process.env.LOG_LOKI_USERNAME && process.env.LOG_LOKI_PASSWORD
          ? {
              username: process.env.LOG_LOKI_USERNAME,
              password: process.env.LOG_LOKI_PASSWORD,
            }
          : undefined,
      labels: {
        application: 'tago-analysis-worker',
        environment: env,
        service: 'backend',
        ...additionalLabels,
        ...parseLokiLabels(process.env.LOG_LOKI_LABELS),
      },
      batching: false, // Send logs immediately without batching
      timeout: parseInt(process.env.LOG_LOKI_TIMEOUT || '30000', 10),
    };

    return {
      level:
        process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
      stream: new LokiTransport(lokiOptions),
    };
  } catch (error) {
    console.error('⚠️ Loki configuration error:', error.message);
    return null;
  }
}

/**
 * Creates a file stream for analysis-specific logging
 *
 * @param {string} logFilePath - Path to log file
 * @param {string} env - Current environment
 * @returns {object|null} File stream or null if no path provided
 */
export function createFileStream(logFilePath, env) {
  if (!logFilePath) {
    return null;
  }

  return {
    level: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
    stream: pino.destination({
      dest: logFilePath,
      sync: false, // Async for better performance
      mkdir: true,
    }),
  };
}
