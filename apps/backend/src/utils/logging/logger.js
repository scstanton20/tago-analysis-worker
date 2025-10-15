import pino from 'pino';

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

// Pino configuration based on environment
const pinoConfig = {
  level: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
  serializers,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
    log: (object) => ({
      ...object,
      hostname: undefined, // Remove hostname for cleaner logs
      pid: undefined, // Remove pid for cleaner logs
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {}, // Remove all base fields for cleaner logs
};

// Configure transports
const transports = [];

// Pretty printing for development
if (env === 'development') {
  const ignoreFields = ['pid', 'hostname'];

  // Hide module and analysis fields from console unless LOG_INCLUDE_MODULE is true
  if (process.env.LOG_INCLUDE_MODULE !== 'true') {
    ignoreFields.push('module', 'analysis');
  }

  transports.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: ignoreFields.join(','),
      messageFormat: '{msg}',
      errorLikeObjectKeys: ['err', 'error'],
    },
  });
}

// Grafana Loki transport (if configured)
if (process.env.LOG_LOKI_URL) {
  try {
    transports.push({
      target: 'pino-loki',
      options: {
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
        batching: process.env.LOG_LOKI_BATCHING !== 'false',
        interval: parseInt(process.env.LOG_LOKI_INTERVAL || '5000'),
        timeout: parseInt(process.env.LOG_LOKI_TIMEOUT || '30000'),
      },
    });
    console.log('✓ Grafana Loki logging transport configured');
  } catch (error) {
    console.error('⚠️ Loki transport configuration error:', error.message);
  }
}

// Apply transports to pino config
if (transports.length > 0) {
  if (transports.length === 1) {
    pinoConfig.transport = transports[0];
  } else {
    pinoConfig.transport = {
      targets: transports,
    };
  }
}

// Helper function to parse Loki labels
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

// Create the main logger
const logger = pino(pinoConfig);

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

  // Create a dedicated logger for this analysis with file transport
  const analysisTransports = [];

  // Include the same transports as the main logger
  if (env === 'development') {
    const ignoreFields = ['pid', 'hostname'];
    if (process.env.LOG_INCLUDE_MODULE !== 'true') {
      ignoreFields.push('module', 'analysis');
    }

    analysisTransports.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: ignoreFields.join(','),
        messageFormat: '{msg}',
        errorLikeObjectKeys: ['err', 'error'],
      },
    });
  }

  // Add Loki transport if configured
  if (process.env.LOG_LOKI_URL) {
    try {
      analysisTransports.push({
        target: 'pino-loki',
        options: {
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
          batching: process.env.LOG_LOKI_BATCHING !== 'false',
          interval: parseInt(process.env.LOG_LOKI_INTERVAL || '5000'),
          timeout: parseInt(process.env.LOG_LOKI_TIMEOUT || '30000'),
        },
      });
    } catch (error) {
      console.error(
        `⚠️ Loki transport error for analysis ${analysisName}:`,
        error.message,
      );
    }
  }

  // Add file transport for individual analysis log
  if (additionalContext.logFile) {
    analysisTransports.push({
      target: 'pino/file',
      options: {
        destination: additionalContext.logFile,
        mkdir: true,
        sync: false, // Async for better performance
      },
    });
  }

  // Create analysis-specific logger with its own transports
  const analysisLogger = pino({
    level: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
    serializers,
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
      log: (object) => ({
        ...object,
        hostname: undefined,
        pid: undefined,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: childContext,
    transport:
      analysisTransports.length === 1
        ? analysisTransports[0]
        : {
            targets: analysisTransports,
          },
  });

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
