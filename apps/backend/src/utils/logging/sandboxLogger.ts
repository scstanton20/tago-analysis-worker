/**
 * Lightweight logger for sandboxed child processes
 *
 * This logger writes directly to stdout/stderr (not console methods)
 * to avoid recursion when console is patched in analysisWrapper.
 *
 * Uses picocolors for ANSI-colored output.
 */

import pc from 'picocolors';

interface LogContext {
  [key: string]: unknown;
}

interface SandboxLogger {
  trace(msgOrContext: string | LogContext, msg?: string): void;
  debug(msgOrContext: string | LogContext, msg?: string): void;
  info(msgOrContext: string | LogContext, msg?: string): void;
  warn(msgOrContext: string | LogContext, msg?: string): void;
  error(msgOrContext: string | LogContext, msg?: string): void;
  fatal(msgOrContext: string | LogContext, msg?: string): void;
  child(childContext: LogContext): SandboxLogger;
}

/** Log level colors using picocolors */
const levelColors = {
  trace: pc.gray,
  debug: pc.cyan,
  info: pc.green,
  warn: pc.yellow,
  error: pc.red,
  fatal: pc.bgRed,
} as const;

/** Format level label with color */
function formatLevel(level: keyof typeof levelColors): string {
  const label = level.toUpperCase().padEnd(5);
  return levelColors[level](label);
}

/**
 * Write to stdout (bypasses console patching)
 */
function writeStdout(message: string): void {
  process.stdout.write(message + '\n');
}

/**
 * Write to stderr (bypasses console patching)
 */
function writeStderr(message: string): void {
  process.stderr.write(message + '\n');
}

/**
 * Create a lightweight logger compatible with pino's API
 * @param name - Logger name/module
 * @param additionalContext - Additional context
 * @returns Logger instance
 */
export function createLogger(
  _name: string,
  additionalContext: LogContext = {},
): SandboxLogger {
  const formatMessage = (
    level: keyof typeof levelColors,
    msgOrContext: string | LogContext,
    msg?: string,
  ): string => {
    let message: string;
    let context: LogContext = { ...additionalContext };

    // Handle pino-style API: logger.info({ key: value }, 'message')
    if (typeof msgOrContext === 'object' && typeof msg === 'string') {
      message = msg;
      context = { ...context, ...msgOrContext };
    } else if (typeof msgOrContext === 'string') {
      message = msgOrContext;
    } else {
      message = JSON.stringify(msgOrContext);
    }

    const contextStr =
      Object.keys(context).length > 0
        ? pc.dim(` ${JSON.stringify(context)}`)
        : '';

    return `${formatLevel(level)} ${message}${contextStr}`;
  };

  return {
    trace: (msgOrContext, msg) =>
      writeStdout(formatMessage('trace', msgOrContext, msg)),
    debug: (msgOrContext, msg) =>
      writeStdout(formatMessage('debug', msgOrContext, msg)),
    info: (msgOrContext, msg) =>
      writeStdout(formatMessage('info', msgOrContext, msg)),
    warn: (msgOrContext, msg) =>
      writeStderr(formatMessage('warn', msgOrContext, msg)),
    error: (msgOrContext, msg) =>
      writeStderr(formatMessage('error', msgOrContext, msg)),
    fatal: (msgOrContext, msg) =>
      writeStderr(formatMessage('fatal', msgOrContext, msg)),
    child: (childContext) =>
      createLogger(_name, { ...additionalContext, ...childContext }),
  };
}
