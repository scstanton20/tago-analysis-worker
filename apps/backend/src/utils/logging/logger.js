import pino from 'pino';
import { LokiTransport } from './lokiTransport.js';

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

// Helper function to parse Loki labels (moved up to be available earlier)
function parseLokiLabels(labelString) {
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

// Configure streams for multistream
const streams = [];

// Console output
if (env === 'development' && !process.env.LOG_LOKI_URL) {
  // Pretty printing for development (only when Loki is not configured)
  const ignoreFields = ['pid', 'hostname'];
  if (process.env.LOG_INCLUDE_MODULE !== 'true') {
    ignoreFields.push('module', 'analysis');
  }

  streams.push({
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
  });
} else {
  // Raw JSON to console when Loki is enabled or in production
  streams.push({
    level: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
    stream: process.stdout,
  });
}

// Grafana Loki stream (if configured)
if (process.env.LOG_LOKI_URL) {
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
        // Parse additional labels from LOG_LOKI_LABELS (format: key1=value1,key2=value2)
        ...parseLokiLabels(process.env.LOG_LOKI_LABELS),
      },
      batching: false, // Send logs immediately without batching
      timeout: parseInt(process.env.LOG_LOKI_TIMEOUT || '30000'),
    };

    streams.push({
      level:
        process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
      stream: new LokiTransport(lokiOptions),
    });

    console.log('✓ Grafana Loki logging configured');
  } catch (error) {
    console.error('⚠️ Loki configuration error:', error.message);
  }
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

  // Create streams for analysis logger using multistream
  const analysisStreams = [];

  // Console output (raw JSON when Loki is enabled)
  if (env === 'development' && !process.env.LOG_LOKI_URL) {
    const ignoreFields = ['pid', 'hostname'];
    if (process.env.LOG_INCLUDE_MODULE !== 'true') {
      ignoreFields.push('module', 'analysis');
    }

    analysisStreams.push({
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
    });
  } else {
    // Raw JSON to console
    analysisStreams.push({
      level:
        process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
      stream: process.stdout,
    });
  }

  // Add Loki stream if configured (using custom LokiTransport)
  if (process.env.LOG_LOKI_URL) {
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
          analysis: analysisName, // Add analysis name as Loki label
          ...parseLokiLabels(process.env.LOG_LOKI_LABELS),
        },
        batching: false, // Send logs immediately without batching
        timeout: parseInt(process.env.LOG_LOKI_TIMEOUT || '30000'),
      };

      analysisStreams.push({
        level:
          process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
        stream: new LokiTransport(lokiOptions),
      });
    } catch (error) {
      console.error(
        `⚠️ Loki transport error for analysis ${analysisName}:`,
        error.message,
      );
    }
  }

  // Add file stream for individual analysis log
  if (additionalContext.logFile) {
    analysisStreams.push({
      level:
        process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
      stream: pino.destination({
        dest: additionalContext.logFile,
        sync: false, // Async for better performance
        mkdir: true,
      }),
    });
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

// Export main logger as default
export default logger;
