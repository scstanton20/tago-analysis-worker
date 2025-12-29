/**
 * Analysis Validation Schemas
 *
 * Zod schemas for analysis-related data validation.
 */

import { z } from 'zod';

/** Analysis ID schema */
export const analysisIdSchema = z.string().min(1, 'Analysis ID is required');

/** Analysis name schema */
export const analysisNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or less')
  .regex(
    /^[a-zA-Z0-9_\-\s]+$/,
    'Name can only contain letters, numbers, underscores, hyphens, and spaces',
  );

/** Analysis status schema */
export const analysisStatusSchema = z.enum([
  'stopped',
  'running',
  'starting',
  'stopping',
  'error',
  'crashed',
]);

/** Analysis config schema */
export const analysisConfigSchema = z.object({
  autoRestart: z.boolean().optional(),
  maxRestarts: z.number().int().min(0).max(100).optional(),
  restartDelay: z.number().int().min(0).max(60000).optional(),
  timeout: z.number().int().min(0).max(3600000).optional(),
  environment: z.record(z.string(), z.string()).optional(),
});

/** Create analysis request schema */
export const createAnalysisSchema = z.object({
  name: analysisNameSchema,
  teamId: z.string().min(1, 'Team ID is required'),
  folderId: z.string().nullable().optional(),
});

/** Update analysis request schema */
export const updateAnalysisSchema = z.object({
  name: analysisNameSchema.optional(),
  folderId: z.string().nullable().optional(),
});

/** Move analysis request schema */
export const moveAnalysisSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  folderId: z.string().nullable().optional(),
});

/** Reorder analyses request schema */
export const reorderAnalysesSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  folderId: z.string().nullable().optional(),
  order: z.array(z.string().min(1)).min(1, 'Order must have at least one item'),
});

/** Trigger analysis request schema */
export const triggerAnalysisSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
});

/** Rollback version request schema */
export const rollbackVersionSchema = z.object({
  version: z.number().int().min(1, 'Version must be at least 1'),
  restart: z.boolean().optional(),
});

/** Get logs query schema */
export const getLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  before: z.coerce.number().int().optional(),
  after: z.coerce.number().int().optional(),
  level: z.enum(['log', 'info', 'warn', 'error', 'debug']).optional(),
  search: z.string().max(200).optional(),
});

/** Batch operation request schema */
export const batchOperationSchema = z.object({
  analysisIds: z
    .array(z.string().min(1))
    .min(1, 'At least one analysis ID is required'),
});

/** Export types from schemas */
export type AnalysisConfig = z.infer<typeof analysisConfigSchema>;
export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>;
export type UpdateAnalysisInput = z.infer<typeof updateAnalysisSchema>;
export type MoveAnalysisInput = z.infer<typeof moveAnalysisSchema>;
export type ReorderAnalysesInput = z.infer<typeof reorderAnalysesSchema>;
export type TriggerAnalysisInput = z.infer<typeof triggerAnalysisSchema>;
export type RollbackVersionInput = z.infer<typeof rollbackVersionSchema>;
export type GetLogsQuery = z.infer<typeof getLogsQuerySchema>;
export type BatchOperationInput = z.infer<typeof batchOperationSchema>;
