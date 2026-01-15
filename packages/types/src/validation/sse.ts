/**
 * SSE Validation Schemas
 *
 * Zod schemas for Server-Sent Events endpoint validation.
 * These schemas validate subscription and unsubscription requests for analysis log streaming.
 */

import { z } from 'zod';
import { analysisIdSchema } from './analysis.js';

/** Session ID schema */
export const sessionIdSchema = z.string().min(1, 'sessionId is required');

/** Empty strict object schema for endpoints with no parameters */
export const emptyStrictSchema = z.object({}).strict();

/** Subscribe to analysis channels request schema */
export const sseSubscribeSchema = z
  .object({
    sessionId: sessionIdSchema,
    analyses: z
      .array(analysisIdSchema)
      .min(1, 'At least one analysis ID must be provided'),
  })
  .strict();

/** Unsubscribe from analysis channels request schema */
export const sseUnsubscribeSchema = z
  .object({
    sessionId: sessionIdSchema,
    analyses: z
      .array(analysisIdSchema)
      .min(1, 'At least one analysis ID must be provided'),
  })
  .strict();

/** Subscribe to metrics channel request schema (sessionId only) */
export const sseSubscribeMetricsSchema = z
  .object({
    sessionId: sessionIdSchema,
  })
  .strict();

/** Export types from schemas */
export type SSESubscribeInput = z.infer<typeof sseSubscribeSchema>;
export type SSEUnsubscribeInput = z.infer<typeof sseUnsubscribeSchema>;
export type SSESubscribeMetricsInput = z.infer<
  typeof sseSubscribeMetricsSchema
>;
