/**
 * Lightweight logger for sandboxed child processes
 *
 * This logger uses console methods but provides a pino-compatible API.
 * All output goes to stdout/stderr which the parent process captures
 * and routes through its pino pipeline (SSE, file, Loki).
 */

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

/**
 * Create a lightweight logger compatible with pino's API
 * @param name - Logger name/module
 * @param additionalContext - Additional context
 * @returns Logger instance
 */
export function createLogger(
  name: string,
  additionalContext: LogContext = {},
): SandboxLogger {
  const prefix = `[${name}]`;

  const formatMessage = (
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
      Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    return `${prefix} ${message}${contextStr}`;
  };

  return {
    trace: (msgOrContext, msg) => console.log(formatMessage(msgOrContext, msg)),
    debug: (msgOrContext, msg) => console.log(formatMessage(msgOrContext, msg)),
    info: (msgOrContext, msg) => console.log(formatMessage(msgOrContext, msg)),
    warn: (msgOrContext, msg) => console.warn(formatMessage(msgOrContext, msg)),
    error: (msgOrContext, msg) =>
      console.error(formatMessage(msgOrContext, msg)),
    fatal: (msgOrContext, msg) =>
      console.error(formatMessage(msgOrContext, msg)),
    child: (childContext) =>
      createLogger(name, { ...additionalContext, ...childContext }),
  };
}
