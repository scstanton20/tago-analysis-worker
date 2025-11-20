// validation/analysisSchemas.js
import { z } from 'zod';

// Filename validation helper
const filenameSchema = z
  .string()
  .min(1, 'Filename is required')
  .regex(
    /^[a-zA-Z0-9_,\-. ]+$/,
    'Filename can only contain alphanumeric characters, spaces, hyphens, commas, underscores, and periods',
  )
  .refine((val) => val !== '.' && val !== '..', 'Invalid filename');

export const analysisValidationSchemas = {
  /**
   * GET /api/analyses - Get all analyses with optional filtering
   */
  getAnalyses: {
    query: z
      .object({
        page: z
          .string()
          .regex(/^\d+$/, 'Page must be a valid positive integer')
          .transform((val) => parseInt(val, 10))
          .optional(),
        limit: z
          .string()
          .regex(/^\d+$/, 'Limit must be a valid positive integer')
          .transform((val) => parseInt(val, 10))
          .optional(),
        search: z
          .string()
          .max(255, 'Search query must not exceed 255 characters')
          .optional(),
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
   * POST /api/analyses/:fileName/run - Run analysis
   */
  runAnalysis: {
    params: z.object({
      fileName: filenameSchema,
    }),
  },

  /**
   * POST /api/analyses/:fileName/stop - Stop analysis
   */
  stopAnalysis: {
    params: z.object({
      fileName: filenameSchema,
    }),
  },

  /**
   * DELETE /api/analyses/:fileName - Delete analysis
   */
  deleteAnalysis: {
    params: z.object({
      fileName: filenameSchema,
    }),
  },

  /**
   * GET /api/analyses/:fileName/content - Get analysis content
   */
  getAnalysisContent: {
    params: z.object({
      fileName: filenameSchema,
    }),
    query: z.object({
      version: z.string().regex(/^\d+$/, 'Version must be a number').optional(),
    }),
  },

  /**
   * PUT /api/analyses/:fileName - Update analysis
   */
  updateAnalysis: {
    params: z.object({
      fileName: filenameSchema,
    }),
    body: z.object({
      content: z.string().min(1, 'Content is required'),
    }),
  },

  /**
   * POST /api/analyses/:fileName/rename - Rename analysis
   */
  renameAnalysis: {
    params: z.object({
      fileName: filenameSchema,
    }),
    body: z.object({
      newFileName: filenameSchema,
    }),
  },

  /**
   * GET /api/analyses/:fileName/logs - Get analysis logs
   */
  getLogs: {
    params: z.object({
      fileName: filenameSchema,
    }),
    query: z.object({
      page: z
        .string()
        .regex(/^\d+$/, 'Page must be a number')
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 1)),
      limit: z
        .string()
        .regex(/^\d+$/, 'Limit must be a number')
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 100)),
    }),
  },

  /**
   * GET /api/analyses/:fileName/logs/download - Download analysis logs
   */
  downloadLogs: {
    params: z.object({
      fileName: filenameSchema,
    }),
    query: z.object({
      timeRange: z.enum(['1h', '24h', '7d', '30d', 'all'], {
        message: 'Invalid time range. Must be one of: 1h, 24h, 7d, 30d, all',
      }),
    }),
  },

  /**
   * DELETE /api/analyses/:fileName/logs - Clear analysis logs
   */
  clearLogs: {
    params: z.object({
      fileName: filenameSchema,
    }),
  },

  /**
   * GET /api/analyses/:fileName/download - Download analysis file
   */
  downloadAnalysis: {
    params: z.object({
      fileName: filenameSchema,
    }),
    query: z.object({
      version: z.string().regex(/^\d+$/, 'Version must be a number').optional(),
    }),
  },

  /**
   * GET /api/analyses/:fileName/versions - Get analysis versions
   */
  getVersions: {
    params: z.object({
      fileName: filenameSchema,
    }),
  },

  /**
   * POST /api/analyses/:fileName/rollback - Rollback to version
   */
  rollbackToVersion: {
    params: z.object({
      fileName: filenameSchema,
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
   * PUT /api/analyses/:fileName/environment - Update analysis environment
   */
  updateEnvironment: {
    params: z.object({
      fileName: filenameSchema,
    }),
    body: z.object({
      env: z.record(z.string(), z.string()),
    }),
  },

  /**
   * GET /api/analyses/:fileName/environment - Get analysis environment
   */
  getEnvironment: {
    params: z.object({
      fileName: filenameSchema,
    }),
  },
};
