// middleware/validateRequest.js

/**
 * Validation middleware factory
 * @param {Object} schema - Zod schemas for body, query, and params
 * @param {Object} [schema.body] - Zod schema for request body
 * @param {Object} [schema.query] - Zod schema for query parameters
 * @param {Object} [schema.params] - Zod schema for route parameters
 * @returns {Function} Express middleware function
 */
export function validateRequest(schema) {
  return (req, res, next) => {
    const logger = req.log?.child({ middleware: 'validateRequest' }) || console;

    try {
      // Validate request body if schema provided
      if (schema.body) {
        const result = schema.body.safeParse(req.body);
        if (!result.success) {
          const errors = result.error.issues.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));

          logger.warn(
            {
              action: 'validateRequest',
              target: 'body',
              errors,
            },
            'Request body validation failed',
          );

          return res.status(400).json({
            error: 'Validation error',
            code: 'INVALID_REQUEST_BODY',
            details: errors,
          });
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
          const errors = result.error.issues.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));

          logger.warn(
            {
              action: 'validateRequest',
              target: 'query',
              errors,
            },
            'Query parameters validation failed',
          );

          return res.status(400).json({
            error: 'Validation error',
            code: 'INVALID_QUERY_PARAMETERS',
            details: errors,
          });
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
          const errors = result.error.issues.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));

          logger.warn(
            {
              action: 'validateRequest',
              target: 'params',
              errors,
            },
            'Route parameters validation failed',
          );

          return res.status(400).json({
            error: 'Validation error',
            code: 'INVALID_ROUTE_PARAMETERS',
            details: errors,
          });
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
      logger.error({ err: error }, 'Unexpected error in validation middleware');
      return res.status(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
}
