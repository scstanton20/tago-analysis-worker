import type { Response, NextFunction, RequestHandler } from 'express';
import type { ZodError, ZodIssue, ZodSchema } from 'zod';
import type { Logger } from 'pino';
import type {
  RequestWithLogger,
  ValidationSchema,
  ValidationErrorDetail,
} from '../types/index.ts';

/** Configuration for validating a request part */
type ValidationConfig = {
  readonly key: 'body' | 'query' | 'params';
  readonly code: string;
  readonly message: string;
};

/** Validation configurations for each request part */
const VALIDATION_CONFIGS: readonly ValidationConfig[] = [
  {
    key: 'body',
    code: 'INVALID_REQUEST_BODY',
    message: 'Request body validation failed',
  },
  {
    key: 'query',
    code: 'INVALID_QUERY_PARAMETERS',
    message: 'Query parameters validation failed',
  },
  {
    key: 'params',
    code: 'INVALID_ROUTE_PARAMETERS',
    message: 'Route parameters validation failed',
  },
] as const;

/**
 * Validate a single part of the request (body, query, or params)
 * @returns true if validation passed or no schema, false if validation failed
 */
function validatePart(
  partSchema: ZodSchema | undefined,
  data: unknown,
  req: RequestWithLogger,
  res: Response,
  logger: Logger | undefined,
  config: ValidationConfig,
): boolean {
  if (!partSchema) {
    return true;
  }

  const result = partSchema.safeParse(data);
  if (!result.success) {
    const errors = mapZodErrors(result.error);

    logger?.warn(
      {
        action: 'validateRequest',
        target: config.key,
        errors,
      },
      config.message,
    );

    res.status(400).json({
      error: 'Validation error',
      code: config.code,
      details: errors,
    });
    return false;
  }

  // Replace request property with parsed/sanitized data (Express 5 compatible)
  Object.defineProperty(req, config.key, {
    value: result.data,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  return true;
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
      for (const config of VALIDATION_CONFIGS) {
        const partSchema = schema[config.key];
        const data = req[config.key];

        if (!validatePart(partSchema, data, req, res, logger, config)) {
          return;
        }
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
