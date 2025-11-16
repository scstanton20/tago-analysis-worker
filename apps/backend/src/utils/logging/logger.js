import pino from 'pino';
import {
  createConsoleStream,
  createLokiStream,
  createFileStream,
} from './streamFactories.js';

// Determine environment from NODE_ENV
const env = process.env.NODE_ENV || 'development';

// Custom serializers for enhanced logging
const serializers = {
  // Process information serializer
  process: (proc) => {
    if (!proc) return proc;
    return {
      pid: proc.pid,
      connected: proc.connected,
      killed: proc.killed,
      exitCode: proc.exitCode,
      signalCode: proc.signalCode,
      spawnfile: proc.spawnfile,
      spawnargs: proc.spawnargs?.slice(0, 3), // Limit args length
    };
  },

  // Error serializer with additional context
  error: (err) => {
    if (!err) return err;
    return {
      type: err.constructor.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      path: err.path,
    };
  },

  // HTTP request serializer
  req: (req) => {
    if (!req) return req;
    return {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers?.['user-agent'],
        'content-type': req.headers?.['content-type'],
        'content-length': req.headers?.['content-length'],
      },
      remoteAddress: req.connection?.remoteAddress,
      remotePort: req.connection?.remotePort,
    };
  },

  // HTTP response serializer
  res: (res) => {
    if (!res) return res;
    return {
      statusCode: res.statusCode,
      headers: {
        'content-type': res.getHeader?.('content-type'),
        'content-length': res.getHeader?.('content-length'),
      },
    };
  },
};

// Configure streams for multistream using factory functions
const streams = [createConsoleStream(env)];

// Add Loki stream if configured
const lokiStream = createLokiStream(env);
if (lokiStream) {
  streams.push(lokiStream);
  console.log('✓ Grafana Loki logging configured');
}

// Create the main logger with multistream
const logger = pino(
  {
    level: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
    serializers,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {}, // Remove all base fields for cleaner logs
  },
  pino.multistream(streams),
);

// Create child logger factory
export const createChildLogger = (name, additionalContext = {}) => {
  const childContext = { ...additionalContext };

  // Always add module for Loki labels, but only include in console if LOG_INCLUDE_MODULE is true
  childContext.module = name;

  return logger.child(childContext);
};

// Create analysis-specific logger with dedicated file transport
export const createAnalysisLogger = (analysisName, additionalContext = {}) => {
  const childContext = {
    analysis: analysisName,
    module: 'analysis',
    ...additionalContext,
  };

  // Create streams for analysis logger using factory functions
  const analysisStreams = [createConsoleStream(env)];

  // Add Loki stream if configured
  const lokiStream = createLokiStream(env, { analysis: analysisName });
  if (lokiStream) {
    analysisStreams.push(lokiStream);
  }

  // Add file stream for individual analysis log
  const fileStream = createFileStream(additionalContext.logFile, env);
  if (fileStream) {
    analysisStreams.push(fileStream);
  }

  // Create analysis-specific logger with multistream
  const analysisLogger = pino(
    {
      level:
        process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
      serializers,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: childContext,
    },
    pino.multistream(analysisStreams),
  );

  return analysisLogger;
};

/**
 * Parse a log line in NDJSON format
 * @param {string} line - The log line to parse (NDJSON format: {"time":"ISO8601","msg":"message"})
 * @param {boolean} asObject - Return as object (true) or formatted string (false)
 * @returns {Object|string|null} Parsed log entry or null if invalid
 */
export function parseLogLine(line, asObject = true) {
  try {
    const logEntry = JSON.parse(line);

    if (!logEntry.time || !logEntry.msg) {
      return null;
    }

    const logDate = new Date(logEntry.time);

    if (asObject) {
      return {
        timestamp: logDate.toLocaleString(),
        message: logEntry.msg,
        time: logEntry.time,
        date: logDate,
      };
    }
    return `[${logDate.toLocaleString()}] ${logEntry.msg}`;
  } catch {
    return null;
  }
}

// Export main logger
export { logger };
