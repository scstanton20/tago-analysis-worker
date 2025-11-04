import { sanitizeAndValidateFilename } from '../utils/safePath.js';
import { createChildLogger } from '../utils/logging/logger.js';

const logger = createChildLogger('sanitize-params');

/**
 * Middleware to sanitize and validate filename parameters
 * Prevents path traversal and validates filename format
 *
 * @param {string} paramName - Name of the parameter to sanitize (default: 'fileName')
 * @returns {Function} Express middleware function
 */
export const sanitizeFilenameParam = (paramName = 'fileName') => {
  return (req, res, next) => {
    const filename = req.params[paramName];

    // If parameter doesn't exist at all (undefined), pass through
    if (filename === undefined) {
      return next();
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
      logger.warn(
        {
          action: 'sanitize_filename_failed',
          filename,
          path: req.path,
          error: error.message,
        },
        'Invalid filename detected',
      );

      return res.status(400).json({
        error: 'Invalid filename',
        details: error.message,
      });
    }
  };
};

/**
 * Middleware to sanitize multiple filename parameters
 *
 * @param {...string} paramNames - Names of parameters to sanitize
 * @returns {Function} Express middleware function
 */
export const sanitizeFilenameParams = (...paramNames) => {
  return (req, res, next) => {
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
      logger.warn(
        {
          action: 'sanitize_filenames_failed',
          params: paramNames,
          error: error.message,
        },
        'Invalid filename detected in batch sanitization',
      );

      return res.status(400).json({
        error: 'Invalid filename',
        details: error.message,
      });
    }
  };
};
