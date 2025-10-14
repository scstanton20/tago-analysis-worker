// frontend/src/utils/logger.js

/**
 * Frontend Logger Utility
 * Browser-compatible logging system inspired by the backend pino logger
 * Supports log levels, contextual logging, and development/production modes
 */

// Log levels with priority
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Color styles for console output (development only)
const LOG_STYLES = {
  debug: 'color: #6B7280; font-weight: normal',
  info: 'color: #3B82F6; font-weight: normal',
  warn: 'color: #F59E0B; font-weight: bold',
  error: 'color: #EF4444; font-weight: bold',
  timestamp: 'color: #9CA3AF; font-weight: normal',
  module: 'color: #8B5CF6; font-weight: bold',
};

/**
 * Logger configuration
 */
const config = {
  // Get log level from environment or default to 'info' in production, 'debug' in development
  level:
    import.meta.env.VITE_LOG_LEVEL ||
    (import.meta.env.MODE === 'development' ? 'debug' : 'info'),
  // Enable/disable colored output
  useColors: import.meta.env.MODE === 'development',
  // Enable/disable timestamps
  showTimestamp: true,
  // Enable/disable module names
  showModule: true,
};

/**
 * Serialize an error object for logging
 * @param {Error} error - Error object to serialize
 * @returns {Object} Serialized error
 */
function serializeError(error) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    type: error.constructor.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...(error.cause && { cause: serializeError(error.cause) }),
  };
}

/**
 * Format timestamp for log output
 * @returns {string} Formatted timestamp
 */
function formatTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Core logger class
 */
class Logger {
  /**
   * Create a new logger instance
   * @param {string} module - Module/service name
   * @param {Object} context - Additional context to include in logs
   */
  constructor(module = null, context = {}) {
    this.module = module;
    this.context = context;
    this.minLevel = LOG_LEVELS[config.level] || LOG_LEVELS.info;
  }

  /**
   * Check if a log level should be logged
   * @param {string} level - Log level to check
   * @returns {boolean} True if level should be logged
   */
  shouldLog(level) {
    // Always log errors in production
    if (level === 'error') {
      return true;
    }
    // In production, suppress non-error logs
    if (import.meta.env.PROD && level !== 'error') {
      return false;
    }
    return LOG_LEVELS[level] >= this.minLevel;
  }

  /**
   * Format and output a log message
   * @param {string} level - Log level
   * @param {string|any} message - Log message or data to log
   * @param {Object} data - Additional data to log
   */
  log(level, message, data = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = formatTimestamp();
    const consoleMethod = console[level] || console.log;

    // Prepare log data
    const logData = {
      ...this.context,
      ...data,
    };

    // Serialize errors in data
    if (logData.error) {
      logData.error = serializeError(logData.error);
    }
    if (logData.err) {
      logData.err = serializeError(logData.err);
    }

    // Development mode: use styled console output
    if (config.useColors) {
      const parts = [];
      const styles = [];

      // Timestamp
      if (config.showTimestamp) {
        parts.push('%c[%s]');
        styles.push(LOG_STYLES.timestamp, timestamp);
      }

      // Level
      parts.push('%c[%s]');
      styles.push(LOG_STYLES[level], level.toUpperCase());

      // Module
      if (config.showModule && this.module) {
        parts.push('%c[%s]');
        styles.push(LOG_STYLES.module, this.module);
      }

      // Message
      parts.push('%c%s');
      styles.push('color: inherit', message);

      // Output with styling and data in single console call
      if (Object.keys(logData).length > 0) {
        consoleMethod(parts.join(' '), ...styles, logData);
      } else {
        consoleMethod(parts.join(' '), ...styles);
      }
    } else {
      // Production mode: simple output
      const parts = [];

      if (config.showTimestamp) {
        parts.push(`[${timestamp}]`);
      }

      parts.push(`[${level.toUpperCase()}]`);

      if (config.showModule && this.module) {
        parts.push(`[${this.module}]`);
      }

      parts.push(message);

      if (Object.keys(logData).length > 0) {
        consoleMethod(parts.join(' '), logData);
      } else {
        consoleMethod(parts.join(' '));
      }
    }
  }

  /**
   * Log at debug level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  debug(message, data) {
    this.log('debug', message, data);
  }

  /**
   * Log at info level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  info(message, data) {
    this.log('info', message, data);
  }

  /**
   * Log at warn level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  warn(message, data) {
    this.log('warn', message, data);
  }

  /**
   * Log at error level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  error(message, data) {
    this.log('error', message, data);
  }

  /**
   * Create a child logger with additional context
   * @param {string} childModule - Child module name (appended to parent)
   * @param {Object} additionalContext - Additional context to merge
   * @returns {Logger} New child logger
   */
  child(childModule, additionalContext = {}) {
    const fullModule = this.module
      ? `${this.module}:${childModule}`
      : childModule;
    return new Logger(fullModule, {
      ...this.context,
      ...additionalContext,
    });
  }
}

/**
 * Create a module-specific logger
 * @param {string} module - Module/service name
 * @param {Object} context - Additional context
 * @returns {Logger} Logger instance
 */
export function createLogger(module, context = {}) {
  return new Logger(module, context);
}

/**
 * Default logger instance for backward compatibility
 */
const defaultLogger = new Logger();

export default defaultLogger;
