/**
 * Express request types with Pino logger integration.
 * Consolidated from duplicate definitions across controllers and middleware.
 */

import type { Request } from 'express';
import type { Logger } from 'pino';

/**
 * Express request extended with request-scoped Pino logger.
 * The `log` property is attached by the pino-http middleware.
 *
 * Note: `log` is required since pino-http middleware guarantees it exists
 * on all requests. `logger` is an optional alias used by some handlers.
 */
export type RequestWithLogger = Omit<Request, 'log'> & {
  /** Request-scoped Pino logger (primary, set by pino-http) */
  log: Logger;
  /** Alias for log (used in some handlers) */
  logger?: Logger;
};
