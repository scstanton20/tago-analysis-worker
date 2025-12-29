import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Logger } from 'pino';
import type { ZodType, ZodError, ZodIssue } from 'zod';

/** Schema configuration for validation */
interface ValidationSchema {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/** Extended request with logger */
interface RequestWithLogger extends Omit<Request, 'log'> {
  log?: Logger;
}

/** Validation error detail */
interface ValidationErrorDetail {
  path: string;
  message: string;
  code: string;
}

/**
 * Validation middleware factory
 * @param schema - Zod schemas for body, query, and params
 * @returns Express middleware function
 */
export function validateRequest(schema: ValidationSchema): RequestHandler {
  return (req: RequestWithLogger, res: Response, next: NextFunction): void => {
    const logger = req.log?.child({ middleware: 'validateRequest' });

    try {
      // Validate request body if schema provided
      if (schema.body) {
        const result = schema.body.safeParse(req.body);
        if (!result.success) {
          const errors = mapZodErrors(result.error);

          logger?.warn(
            {
              action: 'validateRequest',
              target: 'body',
              errors,
            },
            'Request body validation failed',
          );

          res.status(400).json({
            error: 'Validation error',
            code: 'INVALID_REQUEST_BODY',
            details: errors,
          });
          return;
        }
        // Replace req.body with parsed/sanitized data (Express 5 compatible)
        Object.defineProperty(req, 'body', {
          value: result.data,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      // Validate query parameters if schema provided
      if (schema.query) {
        const result = schema.query.safeParse(req.query);
        if (!result.success) {
          const errors = mapZodErrors(result.error);

          logger?.warn(
            {
              action: 'validateRequest',
              target: 'query',
              errors,
            },
            'Query parameters validation failed',
          );

          res.status(400).json({
            error: 'Validation error',
            code: 'INVALID_QUERY_PARAMETERS',
            details: errors,
          });
          return;
        }
        // Replace req.query with parsed/sanitized data (Express 5 compatible)
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      // Validate route parameters if schema provided
      if (schema.params) {
        const result = schema.params.safeParse(req.params);
        if (!result.success) {
          const errors = mapZodErrors(result.error);

          logger?.warn(
            {
              action: 'validateRequest',
              target: 'params',
              errors,
            },
            'Route parameters validation failed',
          );

          res.status(400).json({
            error: 'Validation error',
            code: 'INVALID_ROUTE_PARAMETERS',
            details: errors,
          });
          return;
        }
        // Replace req.params with parsed/sanitized data (Express 5 compatible)
        Object.defineProperty(req, 'params', {
          value: result.data,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      next();
    } catch (error) {
      logger?.error(
        { err: error },
        'Unexpected error in validation middleware',
      );
      res.status(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
}

/**
 * Map Zod errors to validation error details
 */
function mapZodErrors(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map((issue: ZodIssue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}
