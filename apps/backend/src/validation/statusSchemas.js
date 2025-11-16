// validation/statusSchemas.js
import { z } from 'zod';

/**
 * Validation schemas for status endpoints
 * These schemas validate system status and health check requests
 */

export const statusValidationSchemas = {
  /**
   * GET /api/status - Get system status
   * Validates that no query parameters are provided (strict empty object)
   * Public endpoint for health checks
   */
  getSystemStatus: {
    query: z.object({}).strict(),
  },
};
