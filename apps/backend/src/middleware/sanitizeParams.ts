import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { sanitizeAndValidateFilename } from '../validation/shared.ts';
import { createChildLogger } from '../utils/logging/logger.ts';

const logger = createChildLogger('sanitize-params');

/**
 * Middleware to sanitize and validate filename parameters
 * Prevents path traversal and validates filename format
 *
 * @param paramName - Name of the parameter to sanitize (default: 'fileName')
 * @returns Express middleware function
 */
export const sanitizeFilenameParam = (
  paramName = 'fileName',
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const filename = req.params[paramName];

    // If parameter doesn't exist at all (undefined), pass through
    if (filename === undefined) {
      next();
      return;
    }

    try {
      const sanitized = sanitizeAndValidateFilename(filename);
      req.params[paramName] = sanitized;

      logger.debug(
        {
          action: 'sanitize_filename',
          original: filename,
          sanitized,
          path: req.path,
        },
        'Filename sanitized successfully',
      );

      next();
    } catch (error) {
      const err = error as Error;
      logger.warn(
        {
          action: 'sanitize_filename_failed',
          filename,
          path: req.path,
          error: err.message,
        },
        'Invalid filename detected',
      );

      res.status(400).json({
        error: 'Invalid filename',
        details: err.message,
      });
    }
  };
};

/**
 * Middleware to sanitize multiple filename parameters
 *
 * @param paramNames - Names of parameters to sanitize
 * @returns Express middleware function
 */
export const sanitizeFilenameParams = (
  ...paramNames: string[]
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const paramName of paramNames) {
        // Only sanitize if parameter exists (not undefined)
        if (req.params[paramName] !== undefined) {
          req.params[paramName] = sanitizeAndValidateFilename(
            req.params[paramName],
          );
        }
      }
      next();
    } catch (error) {
      const err = error as Error;
      logger.warn(
        {
          action: 'sanitize_filenames_failed',
          params: paramNames,
          error: err.message,
        },
        'Invalid filename detected in batch sanitization',
      );

      res.status(400).json({
        error: 'Invalid filename',
        details: err.message,
      });
    }
  };
};
