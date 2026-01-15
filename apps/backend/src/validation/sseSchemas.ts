// validation/sseSchemas.ts
import {
  sseSubscribeSchema,
  sseUnsubscribeSchema,
  sseSubscribeMetricsSchema,
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
   * POST /api/sse/subscribe/stats or /api/sse/subscribe/logs
   * Validates sessionId (required string, min 1) and analyses array (analysis IDs, min 1 element)
   */
  subscribe: {
    body: sseSubscribeSchema,
  },

  /**
   * POST /api/sse/unsubscribe/stats or /api/sse/unsubscribe/logs
   * Validates sessionId (required string, min 1) and analyses array (analysis IDs, min 1 element)
   */
  unsubscribe: {
    body: sseUnsubscribeSchema,
  },

  /**
   * POST /api/sse/subscribe/metrics or /api/sse/unsubscribe/metrics
   * Validates only sessionId (required string, min 1) - no analyses array
   */
  subscribeMetrics: {
    body: sseSubscribeMetricsSchema,
  },
} as const;
