import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import {
  z,
  dnsConfigSchema,
  dnsStatsSchema,
  dnsConfigResponseSchema,
  dnsConfigUpdateRequestSchema,
  dnsCacheEntriesResponseSchema,
  errorResponseSchema,
} from '@tago-analysis-worker/types/openapi';

export function registerSettingsPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/settings/dns/config',
    summary: 'Get DNS cache configuration and statistics',
    description:
      'Retrieve the current DNS cache configuration settings and performance statistics',
    tags: ['DNS Cache Settings'],
    responses: {
      200: {
        description: 'DNS configuration and stats retrieved successfully',
        content: {
          'application/json': { schema: dnsConfigResponseSchema },
        },
      },
      500: {
        description: 'Failed to get DNS configuration',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/settings/dns/config',
    summary: 'Update DNS cache configuration',
    description:
      'Update DNS cache settings including enabled status, TTL, and max entries. Broadcasts configuration updates via SSE.',
    tags: ['DNS Cache Settings'],
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: dnsConfigUpdateRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'DNS configuration updated successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z
                .string()
                .openapi({ example: 'DNS configuration updated successfully' }),
              config: dnsConfigSchema,
              stats: dnsStatsSchema,
            }),
          },
        },
      },
      400: {
        description: 'Invalid configuration parameters',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      500: {
        description: 'Failed to update DNS configuration',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/settings/dns/entries',
    summary: 'Get all DNS cache entries',
    description:
      'Retrieve all current DNS cache entries with metadata including age, remaining TTL, and expiration status',
    tags: ['DNS Cache Settings'],
    responses: {
      200: {
        description: 'DNS cache entries retrieved successfully',
        content: {
          'application/json': { schema: dnsCacheEntriesResponseSchema },
        },
      },
      500: {
        description: 'Failed to get DNS cache entries',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/settings/dns/cache',
    summary: 'Clear entire DNS cache',
    description:
      'Clear all DNS cache entries and broadcast the cache cleared event via SSE',
    tags: ['DNS Cache Settings'],
    responses: {
      200: {
        description: 'DNS cache cleared successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z
                .string()
                .openapi({ example: 'DNS cache cleared successfully' }),
              entriesCleared: z.number().openapi({
                description: 'Number of entries that were cleared',
                example: 123,
              }),
              stats: dnsStatsSchema,
            }),
          },
        },
      },
      500: {
        description: 'Failed to clear DNS cache',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/settings/dns/cache/{key}',
    summary: 'Delete specific DNS cache entry',
    description: 'Delete a specific DNS cache entry by its cache key',
    tags: ['DNS Cache Settings'],
    request: {
      params: z.object({
        key: z.string().openapi({
          description: "The cache key to delete (e.g., 'google.com:4')",
          example: 'google.com:4',
        }),
      }),
    },
    responses: {
      200: {
        description: 'DNS cache entry deleted successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z
                .string()
                .openapi({ example: 'DNS cache entry deleted successfully' }),
              key: z.string().openapi({
                description: 'The cache key that was deleted',
                example: 'google.com:4',
              }),
            }),
          },
        },
      },
      400: {
        description: 'Cache key is required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'Cache entry not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      500: {
        description: 'Failed to delete DNS cache entry',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/settings/dns/stats/reset',
    summary: 'Reset DNS cache statistics',
    description:
      'Reset all DNS cache performance statistics (hits, misses, errors, evictions) and broadcast the stats reset event via SSE',
    tags: ['DNS Cache Settings'],
    responses: {
      200: {
        description: 'DNS cache statistics reset successfully',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string().openapi({
                example: 'DNS cache statistics reset successfully',
              }),
              stats: dnsStatsSchema,
            }),
          },
        },
      },
      500: {
        description: 'Failed to reset DNS statistics',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/settings/dns/analysis',
    summary: 'Get DNS stats for all analyses',
    description: 'Retrieve DNS cache statistics broken down by analysis',
    tags: ['DNS Cache Settings'],
    responses: {
      200: {
        description: 'Per-analysis DNS stats retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              analysisStats: z.record(
                z.string(),
                z.object({
                  hits: z.number(),
                  misses: z.number(),
                  errors: z.number(),
                  hitRate: z.string(),
                  hostnameCount: z.number(),
                  hostnames: z.array(z.string()),
                }),
              ),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/settings/dns/analysis/{analysisId}',
    summary: 'Get DNS stats for a specific analysis',
    description: 'Retrieve DNS cache statistics for a specific analysis',
    tags: ['DNS Cache Settings'],
    request: {
      params: z.object({
        analysisId: z.string().openapi({ description: 'The analysis ID' }),
      }),
    },
    responses: {
      200: { description: 'Analysis DNS stats retrieved successfully' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/settings/dns/analysis/{analysisId}/entries',
    summary: 'Get DNS cache entries for a specific analysis',
    description: 'Retrieve DNS cache entries used by a specific analysis',
    tags: ['DNS Cache Settings'],
    request: {
      params: z.object({
        analysisId: z.string().openapi({ description: 'The analysis ID' }),
      }),
    },
    responses: {
      200: { description: 'Analysis DNS cache entries retrieved successfully' },
    },
  });
}
