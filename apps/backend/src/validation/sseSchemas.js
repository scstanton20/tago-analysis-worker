// validation/sseSchemas.js
import { z } from 'zod';
import { requiredId, emptyStrictSchema } from './shared.js';

/**
 * Validation schemas for SSE (Server-Sent Events) endpoints
 * These schemas validate subscription and unsubscription requests for analysis log streaming
 */

export const sseValidationSchemas = {
  /**
   * GET /api/sse/events - Establish SSE connection
   * Validates that no query parameters are provided (strict empty object)
   */
  connectSSE: {
    query: emptyStrictSchema,
  },

  /**
   * POST /api/sse/subscribe - Subscribe to analysis channels
   * Validates sessionId (required string, min 1) and analyses array (required, min 1 element)
   */
  subscribe: {
    body: z
      .object({
        sessionId: requiredId('sessionId'),
        analyses: z
          .array(z.string().min(1, 'Analysis name cannot be empty'))
          .min(1, 'At least one analysis must be provided'),
      })
      .strict(),
  },

  /**
   * POST /api/sse/unsubscribe - Unsubscribe from analysis channels
   * Validates sessionId (required string, min 1) and analyses array (required, min 1 element)
   */
  unsubscribe: {
    body: z
      .object({
        sessionId: requiredId('sessionId'),
        analyses: z
          .array(z.string().min(1, 'Analysis name cannot be empty'))
          .min(1, 'At least one analysis must be provided'),
      })
      .strict(),
  },
};
