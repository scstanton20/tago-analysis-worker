// validation/analysisSchemas.js
import { z } from 'zod';
import { filenameSchema, pageSchema, limitSchema } from './shared.ts';

/**
 * Analysis ID schema - validates UUID format for v5.0 config structure
 */
export const analysisIdSchema = z
  .string()
  .uuid('Analysis ID must be a valid UUID');

/** Time range option type */
type LogTimeRangeOption = {
  readonly value: '1h' | '24h' | '7d' | '30d' | 'all';
  readonly label: string;
};

/**
 * Time range options for log downloads.
 */
export const LOG_TIME_RANGE_OPTIONS = [
  { value: '1h', label: 'Last Hour' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'all', label: 'All Logs' },
] as const satisfies ReadonlyArray<LogTimeRangeOption>;

/**
 * Valid time range values for schema validation.
 * Tuple type required for zod enum validation.
 */
export const LOG_TIME_RANGE_VALUES = ['1h', '24h', '7d', '30d', 'all'] as const;

export const analysisValidationSchemas = {
  /**
   * GET /api/analyses - Get all analyses with optional filtering
   */
  getAnalyses: {
    query: z
      .object({
        page: pageSchema,
        limit: limitSchema,
        search: z
          .string()
          .max(255, 'Search query must not exceed 255 characters')
          .optional(),
        id: z.string().uuid('ID must be a valid UUID').optional(),
        teamId: z.string().optional(),
        status: z
          .enum(['running', 'stopped', 'error'], {
            message: 'Status must be one of: running, stopped, error',
          })
          .optional(),
      })
      .strict(),
  },

  /**
   * POST /api/analyses/upload - Upload new analysis
   */
  uploadAnalysis: {
    body: z.object({
      teamId: z.string().min(1, 'teamId is required'),
      targetFolderId: z.string().optional().nullable(),
    }),
  },

  /**
   * POST /api/analyses/:analysisId/run - Run analysis
   */
  runAnalysis: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
  },

  /**
   * POST /api/analyses/:analysisId/stop - Stop analysis
   */
  stopAnalysis: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
  },

  /**
   * DELETE /api/analyses/:analysisId - Delete analysis
   */
  deleteAnalysis: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
  },

  /**
   * GET /api/analyses/:analysisId/content - Get analysis content
   */
  getAnalysisContent: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    query: z.object({
      version: z.string().regex(/^\d+$/, 'Version must be a number').optional(),
    }),
  },

  /**
   * PUT /api/analyses/:analysisId - Update analysis
   */
  updateAnalysis: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    body: z.object({
      content: z.string().min(1, 'Content is required'),
    }),
  },

  /**
   * PUT /api/analyses/:analysisId/rename - Rename analysis
   */
  renameAnalysis: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    body: z.object({
      newName: filenameSchema, // Display name still uses filename validation
    }),
  },

  /**
   * GET /api/analyses/:analysisId/logs - Get analysis logs as plain text
   */
  getLogs: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    query: z.object({
      page: pageSchema,
      limit: limitSchema,
    }),
  },

  /**
   * GET /api/analyses/:analysisId/logs/download - Download analysis logs
   */
  downloadLogs: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    query: z.object({
      timeRange: z.enum(LOG_TIME_RANGE_VALUES, {
        message: `Invalid time range. Must be one of: ${LOG_TIME_RANGE_VALUES.join(', ')}`,
      }),
    }),
  },

  /**
   * DELETE /api/analyses/:analysisId/logs - Clear analysis logs
   */
  clearLogs: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
  },

  /**
   * GET /api/analyses/:analysisId/download - Download analysis file
   */
  downloadAnalysis: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    query: z.object({
      version: z.string().regex(/^\d+$/, 'Version must be a number').optional(),
    }),
  },

  /**
   * GET /api/analyses/:analysisId/versions - Get analysis versions
   */
  getVersions: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    query: z.object({
      page: z
        .string()
        .regex(/^\d+$/, 'Page must be a positive number')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, 'Page must be at least 1')
        .optional()
        .default(1),
      limit: z
        .string()
        .regex(/^\d+$/, 'Limit must be a positive number')
        .transform((val) => parseInt(val, 10))
        .refine(
          (val) => val >= 1 && val <= 100,
          'Limit must be between 1 and 100',
        )
        .optional()
        .default(10),
    }),
  },

  /**
   * POST /api/analyses/:analysisId/rollback - Rollback to version
   */
  rollbackToVersion: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    body: z.object({
      version: z
        .union([z.string(), z.number()])
        .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
        .refine(
          (val) => !isNaN(val) && val >= 0,
          'Valid version number is required',
        ),
    }),
  },

  /**
   * PUT /api/analyses/:analysisId/environment - Update analysis environment
   */
  updateEnvironment: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    body: z.object({
      env: z.record(z.string(), z.string()),
    }),
  },

  /**
   * GET /api/analyses/:analysisId/environment - Get analysis environment
   */
  getEnvironment: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
  },

  /**
   * GET /api/analyses/:analysisId/info - Get analysis notes
   */
  getAnalysisNotes: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
  },

  /**
   * PUT /api/analyses/:analysisId/info - Update analysis notes
   */
  updateAnalysisNotes: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    body: z.object({
      content: z.string().max(100000, 'Notes content must not exceed 100KB'),
    }),
  },

  /**
   * GET /api/analyses/:analysisId/info/meta - Get analysis metadata
   */
  getAnalysisMeta: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
  },
} as const;
