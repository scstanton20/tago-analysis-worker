import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import { z } from '@tago-analysis-worker/types/openapi';

const systemStatusSchema = z
  .object({
    container_health: z.object({
      status: z
        .enum(['healthy', 'initializing'])
        .openapi({ description: 'Container health status' }),
      message: z
        .string()
        .openapi({ description: 'Human-readable status message' }),
      uptime: z.object({
        seconds: z.number().int().openapi({ description: 'Uptime in seconds' }),
        formatted: z.string().openapi({ description: 'Human-readable uptime' }),
      }),
    }),
    tagoConnection: z.object({
      sdkVersion: z
        .string()
        .openapi({ description: 'Version of Tago SDK being used' }),
      runningAnalyses: z
        .number()
        .int()
        .openapi({ description: 'Number of currently running analyses' }),
    }),
    serverTime: z.string().openapi({ description: 'Current server timestamp' }),
  })
  .openapi('SystemStatus');

export function registerStatusPaths(registry: OpenAPIRegistry): void {
  registry.register('SystemStatus', systemStatusSchema);

  registry.registerPath({
    method: 'get',
    path: '/status',
    summary: 'Get system status and health information',
    description:
      'Returns comprehensive status information about the analysis worker including container health, Tago SDK version, and running analyses count. Status updates are also streamed via SSE at /sse/events for real-time monitoring.',
    tags: ['Status'],
    responses: {
      200: {
        description: 'System is healthy and ready',
        content: {
          'application/json': {
            schema: systemStatusSchema,
          },
        },
      },
      203: {
        description: 'System is initializing (Non-Authoritative Information)',
        content: {
          'application/json': {
            schema: systemStatusSchema,
          },
        },
      },
      500: {
        description: 'System error occurred',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().openapi({ example: 'Internal server error' }),
              message: z
                .string()
                .openapi({ example: 'Detailed error message' }),
            }),
          },
        },
      },
    },
  });
}
