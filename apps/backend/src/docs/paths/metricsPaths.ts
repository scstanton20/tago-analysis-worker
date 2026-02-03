import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import { z, errorResponseSchema } from '@tago-analysis-worker/types/openapi';

export function registerMetricsPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/metrics',
    summary: 'Get Prometheus metrics',
    description:
      'Returns application metrics in Prometheus/OpenMetrics format for monitoring and observability',
    tags: ['Monitoring'],
    responses: {
      200: {
        description: 'Metrics retrieved successfully',
        content: {
          'application/openmetrics-text': {
            schema: z
              .string()
              .openapi({ description: 'Prometheus-formatted metrics' }),
          },
        },
      },
      401: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  });
}
