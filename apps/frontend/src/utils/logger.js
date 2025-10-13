// frontend/src/utils/logger.js

/**
 * Conditional logger that only outputs in development mode
 * In production, logs are suppressed to improve performance and prevent information leakage
 */
const logger = {
  /**
   * Log informational messages (only in development)
   * @param {...any} args - Arguments to log
   */
  log: (...args) => {
    if (import.meta.env.DEV) {
      console.log(...args);
    }
  },

  /**
   * Log warning messages (only in development)
   * @param {...any} args - Arguments to log
   */
  warn: (...args) => {
    if (import.meta.env.DEV) {
      console.warn(...args);
    }
  },

  /**
   * Log error messages (always logged, even in production)
   * @param {...any} args - Arguments to log
   */
  error: (...args) => {
    console.error(...args);
  },

  /**
   * Log informational messages (only in development)
   * @param {...any} args - Arguments to log
   */
  info: (...args) => {
    if (import.meta.env.DEV) {
      console.info(...args);
    }
  },

  /**
   * Log debug messages (only in development)
   * @param {...any} args - Arguments to log
   */
  debug: (...args) => {
    if (import.meta.env.DEV) {
      console.debug(...args);
    }
  },
};

export default logger;
