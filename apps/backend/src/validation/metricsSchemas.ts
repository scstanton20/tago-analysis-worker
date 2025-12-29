// validation/metricsSchemas.js
import { emptyStrictSchema } from './shared.ts';

/**
 * Validation schemas for metrics endpoints
 * These schemas validate Prometheus metrics endpoint requests
 */

export const metricsValidationSchemas = {
  /**
   * GET /api/metrics/metrics - Get Prometheus metrics
   * Validates that no query parameters are provided (strict empty object)
   * Authenticated endpoint for Prometheus scraping
   */
  getMetrics: {
    query: emptyStrictSchema,
  },
};
