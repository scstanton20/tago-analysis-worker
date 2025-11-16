import { createChildLogger } from './logging/logger.js';

const defaultLogger = createChildLogger('async-handler');

/**
 * Enhanced async handler wrapper for Express route handlers
 * Catches promise rejections and handles errors with consistent logging and HTTP status codes
 *
 * @param {Function} fn - Express route handler function
 * @param {string} operation - Operation name for error messages (e.g., 'uploading analysis')
 * @returns {Function} Wrapped route handler
 */
export const asyncHandler = (fn, operation) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      const logger = req.logger || req.log || defaultLogger;

      // Log the error
      logger.error(
        { err: error, operation },
        `Error ${operation || 'in request'}`,
      );

      // Handle specific error types with appropriate status codes
      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      if (error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }

      if (error.message.includes('Cannot move')) {
        return res.status(400).json({ error: error.message });
      }

      // Default 500 error
      const errorMessage = operation
        ? `Failed to ${operation}`
        : error.message || 'An error occurred';
      return res.status(500).json({ error: errorMessage });
    }
  };
};
