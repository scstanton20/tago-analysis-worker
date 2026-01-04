// validation/sseSchemas.ts
import {
  sseSubscribeSchema,
  sseUnsubscribeSchema,
  emptyStrictSchema,
} from '@tago-analysis-worker/types/validation';

/**
 * Validation schemas for SSE (Server-Sent Events) endpoints
 * Uses shared schemas from @tago-analysis-worker/types for consistency
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
   * Validates sessionId (required string, min 1) and analyses array (analysis IDs, min 1 element)
   */
  subscribe: {
    body: sseSubscribeSchema,
  },

  /**
   * POST /api/sse/unsubscribe - Unsubscribe from analysis channels
   * Validates sessionId (required string, min 1) and analyses array (analysis IDs, min 1 element)
   */
  unsubscribe: {
    body: sseUnsubscribeSchema,
  },
} as const;
