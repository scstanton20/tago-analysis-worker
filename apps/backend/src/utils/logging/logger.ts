import pino from 'pino';
import type { Logger } from 'pino';
import {
  createConsoleStream,
  createLokiStream,
  createFileStream,
} from './streamFactories.ts';

// Determine environment from NODE_ENV
const env = process.env.NODE_ENV || 'development';

interface ProcessInfo {
  pid?: number;
  connected?: boolean;
  killed?: boolean;
  exitCode?: number | null;
  signalCode?: string | null;
  spawnfile?: string;
  spawnargs?: string[];
}

interface ErrorInfo {
  constructor: { name: string };
  message: string;
  stack?: string;
  code?: string;
  errno?: number;
  syscall?: string;
  path?: string;
}

interface RequestInfo {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  connection?: {
    remoteAddress?: string;
    remotePort?: number;
  };
}

interface ResponseInfo {
  statusCode?: number;
  getHeader?: (name: string) => string | number | string[] | undefined;
}

// Custom serializers for enhanced logging
const serializers = {
  // Process information serializer
  process: (proc: ProcessInfo | null | undefined) => {
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
  error: (err: ErrorInfo | null | undefined) => {
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
  req: (req: RequestInfo | null | undefined) => {
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
  res: (res: ResponseInfo | null | undefined) => {
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
const streams: Array<{ level: string; stream: NodeJS.WritableStream }> = [
  createConsoleStream(env) as { level: string; stream: NodeJS.WritableStream },
];

// Add Loki stream if configured
const lokiStream = createLokiStream(env);
if (lokiStream) {
  streams.push(lokiStream as { level: string; stream: NodeJS.WritableStream });
  console.log('✓ Grafana Loki logging configured');
}

// Create the main logger with multistream
const logger: Logger = pino(
  {
    level: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
    serializers,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {}, // Remove all base fields for cleaner logs
  },
  pino.multistream(streams),
);

interface LoggerContext {
  module?: string;
  [key: string]: unknown;
}

/**
 * Create child logger factory
 */
export const createChildLogger = (
  name: string,
  additionalContext: Record<string, unknown> = {},
): Logger => {
  const childContext: LoggerContext = { ...additionalContext };

  // Always add module for Loki labels, but only include in console if LOG_INCLUDE_MODULE is true
  childContext.module = name;

  return logger.child(childContext);
};

interface AnalysisLoggerContext {
  analysis?: string;
  module?: string;
  logFile?: string;
  [key: string]: unknown;
}

/**
 * Create analysis-specific logger with dedicated file transport
 */
export const createAnalysisLogger = (
  analysisName: string,
  additionalContext: AnalysisLoggerContext = {},
): Logger => {
  const childContext: AnalysisLoggerContext = {
    analysis: analysisName,
    module: 'analysis',
    ...additionalContext,
  };

  // Create streams for analysis logger using factory functions
  const analysisStreams: Array<{
    level: string;
    stream: NodeJS.WritableStream;
  }> = [
    createConsoleStream(env) as {
      level: string;
      stream: NodeJS.WritableStream;
    },
  ];

  // Add Loki stream if configured
  const analysisLokiStream = createLokiStream(env, { analysis: analysisName });
  if (analysisLokiStream) {
    analysisStreams.push(
      analysisLokiStream as {
        level: string;
        stream: NodeJS.WritableStream;
      },
    );
  }

  // Add file stream for individual analysis log
  const fileStream = createFileStream(additionalContext.logFile, env);
  if (fileStream) {
    analysisStreams.push(
      fileStream as {
        level: string;
        stream: NodeJS.WritableStream;
      },
    );
  }

  // Create analysis-specific logger with multistream
  const analysisLogger: Logger = pino(
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

interface ParsedLogEntry {
  timestamp: string;
  message: string;
  time: string;
  date: Date;
}

/**
 * Parse a log line in NDJSON format
 */
export function parseLogLine(
  line: string,
  asObject?: true,
): ParsedLogEntry | null;
export function parseLogLine(line: string, asObject: false): string | null;
export function parseLogLine(
  line: string,
  asObject: boolean = true,
): ParsedLogEntry | string | null {
  try {
    const logEntry = JSON.parse(line) as { time?: string; msg?: string };

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
