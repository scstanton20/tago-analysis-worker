import pino from 'pino';
import { LokiTransport } from './lokiTransport.ts';
import { createPrettyStream } from './prettyStream.ts';

type Environment = 'development' | 'production' | 'test';

interface StreamConfig {
  level: string;
  stream: NodeJS.WritableStream | ReturnType<typeof pino.destination>;
}

interface LokiLabels {
  [key: string]: string;
}

/**
 * Parse Loki labels from environment variable
 * Format: key1=value1,key2=value2
 */
export function parseLokiLabels(labelString: string | undefined): LokiLabels {
  if (!labelString) return {};

  try {
    const labels: LokiLabels = {};
    labelString.split(',').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key && value) {
        labels[key.trim()] = value.trim();
      }
    });
    return labels;
  } catch (error) {
    console.error(
      `Error parsing Loki labels "${labelString}":`,
      (error as Error).message,
    );
    return {};
  }
}

/**
 * Creates a console stream with pretty colored formatting
 *
 * Uses a lightweight picocolors-based formatter for human-readable output.
 * Loki (if configured) receives structured JSON via its own transport.
 */
export function createConsoleStream(
  env: Environment | string,
  additionalIgnoreFields: string[] = [],
): StreamConfig {
  const includeModule = process.env.LOG_INCLUDE_MODULE === 'true';
  const level =
    process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info');

  const prettyStream = createPrettyStream({
    ignore: additionalIgnoreFields,
    includeModule,
  });

  // Pipe pretty stream to stdout
  prettyStream.pipe(process.stdout);

  return {
    level,
    stream: prettyStream,
  };
}

/**
 * Creates a Loki transport stream for centralized logging
 */
export function createLokiStream(
  env: Environment | string,
  additionalLabels: LokiLabels = {},
): StreamConfig | null {
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
    console.error('⚠️ Loki configuration error:', (error as Error).message);
    return null;
  }
}

/**
 * Creates a file stream for analysis-specific logging
 */
export function createFileStream(
  logFilePath: string | undefined,
  env: Environment | string,
): StreamConfig | null {
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
