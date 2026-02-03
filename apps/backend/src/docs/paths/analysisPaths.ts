import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import {
  z,
  analysisSchema,
  analysisEnvironmentNamedSchema,
  errorResponseSchema,
  validationErrorResponseSchema,
  successResponseSchema,
} from '@tago-analysis-worker/types/openapi';

const analysisIdParam = z.object({
  analysisId: z
    .string()
    .uuid()
    .openapi({ description: 'UUID of the analysis' }),
});

const permissionError = {
  403: {
    description: 'Insufficient permissions',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
} as const;

const notFoundError = {
  404: {
    description: 'Analysis not found',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
} as const;

export function registerAnalysisPaths(registry: OpenAPIRegistry): void {
  // Upload
  registry.registerPath({
    method: 'post',
    path: '/analyses/upload',
    summary: 'Upload analysis file',
    description: 'Upload a new Tago.io analysis script',
    tags: ['Analysis Management'],
    request: {
      body: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: z.object({
              analysis: z.string().openapi({
                description: 'Analysis JavaScript file',
                format: 'binary',
              }),
              teamId: z
                .string()
                .openapi({ description: 'Team ID to assign the analysis' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Analysis uploaded successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string(),
              filename: z.string(),
            }),
          },
        },
      },
      400: {
        description: 'No file uploaded or invalid file',
        content: {
          'application/json': { schema: validationErrorResponseSchema },
        },
      },
      ...permissionError,
      413: {
        description: 'File size exceeds maximum limit (50MB)',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().openapi({
                example: 'File size exceeds the maximum limit of 50MB',
              }),
              maxSizeMB: z.number().openapi({ example: 50 }),
              fileSizeMB: z.string().openapi({ example: '12.34' }),
            }),
          },
        },
      },
    },
  });

  // Get all analyses
  registry.registerPath({
    method: 'get',
    path: '/analyses',
    summary: 'Get all analyses',
    description:
      "Retrieve list of all analyses with their current status and configuration.\nSupports filtering by search term, status, and team. Pagination is optional.\n\n**Permissions:** Results are filtered based on user's team permissions.\nAdmin users see all analyses; regular users only see analyses in their teams.",
    tags: ['Analysis Management'],
    request: {
      query: z.object({
        search: z.string().max(255).optional().openapi({
          description: 'Case-insensitive name filter for analysis name',
        }),
        id: z
          .string()
          .uuid()
          .optional()
          .openapi({ description: 'Filter by analysis ID (exact match)' }),
        status: z
          .enum(['running', 'stopped', 'error'])
          .optional()
          .openapi({ description: 'Filter by analysis status' }),
        teamId: z
          .string()
          .uuid()
          .optional()
          .openapi({ description: 'Filter by team/department ID' }),
        page: z.coerce.number().int().min(1).optional().openapi({
          description: 'Page number for pagination (requires limit)',
        }),
        limit: z.coerce.number().int().min(1).max(100).optional().openapi({
          description: 'Number of results per page (requires page)',
        }),
      }),
    },
    responses: {
      200: {
        description: 'List of analyses retrieved successfully',
        content: {
          'application/json': {
            schema: z.union([
              z
                .record(z.string(), analysisSchema)
                .openapi({ description: 'Non-paginated response' }),
              z
                .object({
                  analyses: z.record(z.string(), analysisSchema),
                  pagination: z.object({
                    page: z.number().int(),
                    limit: z.number().int(),
                    total: z.number().int(),
                    totalPages: z.number().int(),
                    hasMore: z.boolean(),
                  }),
                })
                .openapi({ description: 'Paginated response' }),
            ]),
          },
        },
      },
      ...permissionError,
    },
  });

  // Run analysis
  registry.registerPath({
    method: 'post',
    path: '/analyses/{analysisId}/run',
    summary: 'Run analysis',
    description: 'Start execution of a specific analysis',
    tags: ['Analysis Execution'],
    request: {
      params: analysisIdParam,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              type: z
                .enum(['listener'])
                .optional()
                .openapi({ description: 'Type of analysis execution' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Analysis started successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string(),
              process: z
                .object({})
                .passthrough()
                .openapi({ description: 'Process information' }),
            }),
          },
        },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Stop analysis
  registry.registerPath({
    method: 'post',
    path: '/analyses/{analysisId}/stop',
    summary: 'Stop analysis',
    description: 'Stop execution of a running analysis',
    tags: ['Analysis Execution'],
    request: { params: analysisIdParam },
    responses: {
      200: {
        description: 'Analysis stopped successfully',
        content: {
          'application/json': { schema: z.object({ message: z.string() }) },
        },
      },
      404: {
        description: 'Analysis not found or not running',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...permissionError,
    },
  });

  // Delete analysis
  registry.registerPath({
    method: 'delete',
    path: '/analyses/{analysisId}',
    summary: 'Delete analysis',
    description: 'Delete an analysis and all its associated data',
    tags: ['Analysis Management'],
    request: { params: analysisIdParam },
    responses: {
      200: {
        description: 'Analysis deleted successfully',
        content: {
          'application/json': { schema: successResponseSchema },
        },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Get analysis content
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/content',
    summary: 'Get analysis file content',
    description: 'Retrieve the source code content of an analysis',
    tags: ['Analysis Management'],
    request: { params: analysisIdParam },
    responses: {
      200: {
        description: 'Analysis content retrieved successfully',
        content: {
          'text/plain': {
            schema: z
              .string()
              .openapi({ description: 'The analysis file source code' }),
          },
        },
      },
      404: {
        description: 'Analysis file not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...permissionError,
    },
  });

  // Update analysis content
  registry.registerPath({
    method: 'put',
    path: '/analyses/{analysisId}',
    summary: 'Update analysis content',
    description: 'Update the source code content of an analysis',
    tags: ['Analysis Management'],
    request: {
      params: analysisIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              content: z
                .string()
                .openapi({ description: 'New analysis source code content' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Analysis updated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              message: z
                .string()
                .openapi({ example: 'Analysis updated successfully' }),
              restarted: z.boolean().openapi({
                description: 'Whether the analysis was restarted after update',
              }),
            }),
          },
        },
      },
      400: {
        description: 'Invalid content provided',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Rename analysis
  registry.registerPath({
    method: 'put',
    path: '/analyses/{analysisId}/rename',
    summary: 'Rename analysis',
    description: 'Rename an analysis to a new display name',
    tags: ['Analysis Management'],
    request: {
      params: analysisIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              newName: z
                .string()
                .openapi({ description: 'New display name for the analysis' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Analysis renamed successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              message: z
                .string()
                .openapi({ example: 'Analysis renamed successfully' }),
              restarted: z.boolean().openapi({
                description: 'Whether the analysis was restarted after rename',
              }),
            }),
          },
        },
      },
      400: {
        description: 'Invalid new filename provided',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Download analysis
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/download',
    summary: 'Download analysis file',
    description: 'Download the current analysis file or a specific version',
    tags: ['Analysis Management'],
    request: {
      params: analysisIdParam,
      query: z.object({
        version: z.coerce.number().int().min(1).optional().openapi({
          description:
            'Specific version to download. If not provided or 0, downloads current version',
        }),
      }),
    },
    responses: {
      200: {
        description: 'Analysis file downloaded successfully',
        content: {
          'application/javascript': {
            schema: z.string().openapi({ format: 'binary' }),
          },
        },
      },
      400: {
        description: 'Invalid version number',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'Analysis or version not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...permissionError,
    },
  });

  // Get environment
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/environment',
    summary: 'Get analysis environment variables',
    description: 'Retrieve environment variables for an analysis',
    tags: ['Analysis Management'],
    request: { params: analysisIdParam },
    responses: {
      200: {
        description: 'Environment variables retrieved successfully',
        content: {
          'application/json': { schema: analysisEnvironmentNamedSchema },
        },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Update environment
  registry.registerPath({
    method: 'put',
    path: '/analyses/{analysisId}/environment',
    summary: 'Update analysis environment variables',
    description: 'Update environment variables for an analysis',
    tags: ['Analysis Management'],
    request: {
      params: analysisIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              env: analysisEnvironmentNamedSchema,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Environment variables updated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              message: z
                .string()
                .openapi({ example: 'Environment updated successfully' }),
              restarted: z.boolean().openapi({
                description: 'Whether the analysis was restarted after update',
              }),
            }),
          },
        },
      },
      400: {
        description: 'Invalid environment variables provided',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Get logs
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/logs',
    summary: 'Get analysis logs',
    description:
      'Retrieve logs for an analysis as plain text.\nEach line is formatted as: [HH:MM:SS] message',
    tags: ['Analysis Logs'],
    request: {
      params: analysisIdParam,
      query: z.object({
        page: z.coerce
          .number()
          .int()
          .min(1)
          .default(1)
          .optional()
          .openapi({ description: 'Page number for pagination' }),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .default(200)
          .optional()
          .openapi({ description: 'Number of log entries per page' }),
      }),
    },
    responses: {
      200: {
        description: 'Logs retrieved successfully as plain text',
        content: {
          'text/plain': {
            schema: z.string().openapi({
              description:
                'Log entries, one per line in format [HH:MM:SS] message',
            }),
          },
        },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Download logs
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/logs/download',
    summary: 'Download analysis logs',
    description:
      'Download logs for a specific time range as a compressed zip file',
    tags: ['Analysis Logs'],
    request: {
      params: analysisIdParam,
      query: z.object({
        timeRange: z
          .enum(['1h', '24h', '7d', '30d', 'all'])
          .openapi({ description: 'Time range for logs to download' }),
      }),
    },
    responses: {
      200: {
        description: 'Compressed log file downloaded successfully',
        content: {
          'application/zip': {
            schema: z.string().openapi({ format: 'binary' }),
          },
        },
      },
      400: {
        description: 'Invalid time range',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'Analysis or log file not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...permissionError,
    },
  });

  // Log download options
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/logs/options',
    summary: 'Get log download options',
    description: 'Returns available time range options for log downloads',
    tags: ['Analysis Logs'],
    request: { params: analysisIdParam },
    responses: {
      200: {
        description: 'Available time range options',
        content: {
          'application/json': {
            schema: z.object({
              timeRangeOptions: z.array(
                z.object({
                  value: z.string().openapi({
                    description:
                      'The value to use in the timeRange query parameter',
                  }),
                  label: z.string().openapi({
                    description: 'Human-readable label for display',
                  }),
                }),
              ),
            }),
          },
        },
      },
    },
  });

  // Clear logs
  registry.registerPath({
    method: 'delete',
    path: '/analyses/{analysisId}/logs',
    summary: 'Clear analysis logs',
    description: 'Clear all log entries for an analysis',
    tags: ['Analysis Logs'],
    request: { params: analysisIdParam },
    responses: {
      200: {
        description: 'Logs cleared successfully',
        content: {
          'application/json': { schema: successResponseSchema },
        },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Get versions
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/versions',
    summary: 'Get version history',
    description:
      'Retrieve all saved versions of an analysis with metadata including timestamps and file sizes',
    tags: ['Analysis Management'],
    request: { params: analysisIdParam },
    responses: {
      200: {
        description: 'Version history retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              versions: z.array(analysisSchema),
              nextVersionNumber: z.number().int().openapi({
                description: 'Next version number that will be used',
              }),
            }),
          },
        },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Rollback
  registry.registerPath({
    method: 'post',
    path: '/analyses/{analysisId}/rollback',
    summary: 'Rollback to previous version',
    description:
      'Rollback analysis to a specific version. Current version is automatically saved if content differs from target version.',
    tags: ['Analysis Management'],
    request: {
      params: analysisIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              version: z
                .number()
                .int()
                .min(1)
                .openapi({ description: 'Version number to rollback to' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Rollback completed successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z
                .boolean()
                .openapi({ description: 'Whether rollback was successful' }),
              message: z.string().openapi({ description: 'Success message' }),
              version: z
                .number()
                .int()
                .openapi({ description: 'Version rolled back to' }),
              restarted: z.boolean().openapi({
                description: 'Whether analysis was restarted after rollback',
              }),
            }),
          },
        },
      },
      400: {
        description: 'Invalid version number or version not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Get analysis metadata
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/info/meta',
    summary: 'Get analysis metadata',
    description:
      'Retrieve comprehensive metadata about an analysis including:\n- File statistics (size, line count, creation/modification dates)\n- Environment variable summary (count, size)\n- Log file statistics\n- Version history summary\n- Team ownership information\n- Process status and metrics (if running)\n- DNS cache usage statistics',
    tags: ['Analysis Management'],
    request: { params: analysisIdParam },
    responses: {
      200: { description: 'Analysis metadata retrieved successfully' },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Get analysis notes
  registry.registerPath({
    method: 'get',
    path: '/analyses/{analysisId}/info',
    summary: 'Get analysis notes',
    description:
      'Retrieve markdown notes for an analysis.\nIf no notes exist, a default template will be created and returned.',
    tags: ['Analysis Management'],
    request: { params: analysisIdParam },
    responses: {
      200: { description: 'Analysis notes retrieved successfully' },
      ...notFoundError,
      ...permissionError,
    },
  });

  // Update analysis notes
  registry.registerPath({
    method: 'put',
    path: '/analyses/{analysisId}/info',
    summary: 'Update analysis notes',
    description: 'Update markdown notes for an analysis',
    tags: ['Analysis Management'],
    request: {
      params: analysisIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              content: z
                .string()
                .max(100000)
                .openapi({ description: 'Markdown content for the notes' }),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: 'Notes updated successfully' },
      400: {
        description: 'Invalid content provided',
        content: {
          'application/json': { schema: validationErrorResponseSchema },
        },
      },
      ...notFoundError,
      ...permissionError,
    },
  });
}
