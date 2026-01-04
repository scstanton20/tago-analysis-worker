/**
 * Lightweight Pretty Stream for Pino
 *
 * A custom Transform stream that formats pino JSON logs into human-readable
 * colored output using picocolors. Replaces pino-pretty for a lighter footprint.
 */

import { Transform, type TransformCallback } from 'node:stream';
import pc from 'picocolors';

/** Pino log levels */
const LEVEL_NAMES: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

/** Level colors using picocolors */
const LEVEL_COLORS: Record<number, (s: string) => string> = {
  10: pc.gray,
  20: pc.cyan,
  30: pc.green,
  40: pc.yellow,
  50: pc.red,
  60: pc.bgRed,
};

/** Fields to ignore in output */
const DEFAULT_IGNORE = ['pid', 'hostname', 'time', 'level', 'msg'];

interface PrettyStreamOptions {
  /** Additional fields to ignore */
  ignore?: string[];
  /** Whether to include module/analysis in output */
  includeModule?: boolean;
}

interface PinoLogEntry {
  level: number;
  time: string | number;
  msg: string;
  module?: string;
  analysis?: string;
  err?: {
    type?: string;
    message?: string;
    stack?: string;
  };
  [key: string]: unknown;
}

/**
 * Format timestamp from ISO string or unix timestamp
 */
function formatTime(time: string | number): string {
  const date = typeof time === 'number' ? new Date(time) : new Date(time);
  const pad = (n: number): string => n.toString().padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Format level label with color
 */
function formatLevel(level: number): string {
  const name = LEVEL_NAMES[level] || 'LOG';
  const colorFn = LEVEL_COLORS[level] || pc.white;
  return colorFn(name.padEnd(5));
}

/**
 * Format error object if present
 */
function formatError(err: PinoLogEntry['err']): string {
  if (!err) return '';

  const lines: string[] = [];
  if (err.type) lines.push(pc.red(`  Type: ${err.type}`));
  if (err.message) lines.push(pc.red(`  Message: ${err.message}`));
  if (err.stack) {
    const stackLines = err.stack
      .split('\n')
      .slice(1)
      .map((line) => pc.dim(`    ${line.trim()}`));
    lines.push(...stackLines);
  }

  return lines.length > 0 ? '\n' + lines.join('\n') : '';
}

/**
 * Format extra context fields
 */
function formatContext(entry: PinoLogEntry, ignoreFields: Set<string>): string {
  const contextFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(entry)) {
    if (!ignoreFields.has(key) && key !== 'err') {
      contextFields[key] = value;
    }
  }

  if (Object.keys(contextFields).length === 0) return '';

  return pc.dim(` ${JSON.stringify(contextFields)}`);
}

/**
 * Create a pretty stream Transform
 */
export function createPrettyStream(
  options: PrettyStreamOptions = {},
): Transform {
  const ignoreFields = new Set([
    ...DEFAULT_IGNORE,
    ...(options.ignore || []),
    ...(options.includeModule ? [] : ['module', 'analysis']),
  ]);

  return new Transform({
    objectMode: false,
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      const lines = chunk.toString().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as PinoLogEntry;

          // Format: TIME LEVEL [module] message {context}
          const time = pc.dim(formatTime(entry.time));
          const level = formatLevel(entry.level);
          const module =
            options.includeModule && entry.module
              ? pc.dim(`[${entry.module}] `)
              : '';
          const msg = entry.msg || '';
          const context = formatContext(entry, ignoreFields);
          const error = formatError(entry.err);

          const formatted = `${time} ${level} ${module}${msg}${context}${error}\n`;
          this.push(formatted);
        } catch {
          // Not JSON, pass through as-is
          this.push(line + '\n');
        }
      }

      callback();
    },
  });
}
