import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { createChildLogger } from './logging/logger.ts';

const defaultLogger = createChildLogger('async-handler');

// Use type intersection instead of interface extension to avoid index signature conflicts
type RequestWithLogger = Request & {
  logger?: Logger;
  log?: Logger;
};

/**
 * Type for controller handler functions that may use extended request types.
 * Controllers define their own request types; we use type assertion for flexibility.
 */
type ControllerHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Enhanced async handler wrapper for Express route handlers
 * Catches promise rejections and handles errors with consistent logging and HTTP status codes
 *
 * Note: Controller functions with extended request types are compatible via type assertion.
 * Type safety is maintained at the controller level.
 */
export const asyncHandler = (
  fn: ControllerHandler,
  operation?: string,
): RequestHandler => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const reqWithLogger = req as RequestWithLogger;
    try {
      await fn(req, res, next);
    } catch (error) {
      const logger = reqWithLogger.logger || reqWithLogger.log || defaultLogger;

      // Log the error
      logger.error(
        { err: error, operation },
        `Error ${operation || 'in request'}`,
      );

      // Handle specific error types with appropriate status codes
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes('Path traversal') ||
        errorMessage.includes('Invalid filename')
      ) {
        res.status(400).json({ error: 'Invalid file path' });
        return;
      }

      if (errorMessage.includes('not found')) {
        res.status(404).json({ error: errorMessage });
        return;
      }

      if (errorMessage.includes('already exists')) {
        res.status(409).json({ error: errorMessage });
        return;
      }

      if (errorMessage.includes('Cannot move')) {
        res.status(400).json({ error: errorMessage });
        return;
      }

      // Default 500 error
      const responseMessage = operation
        ? `Failed to ${operation}`
        : errorMessage || 'An error occurred';
      res.status(500).json({ error: responseMessage });
    }
  };
};
