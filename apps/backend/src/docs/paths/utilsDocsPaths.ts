import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import { z, errorResponseSchema } from '@tago-analysis-worker/types/openapi';

const packageSchema = z.object({
  name: z.string(),
  import: z.string(),
  description: z.string(),
  docsUrl: z.string(),
});

const utilitySchema = z.object({
  name: z.string(),
  import: z.string(),
  description: z.string(),
});

export function registerUtilsDocsPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/utils-docs',
    summary: 'Get available packages and utilities overview',
    description: 'Retrieve simple lists of available packages and utilities',
    tags: ['Utilities Documentation'],
    responses: {
      200: {
        description: 'Overview retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              packages: z.array(packageSchema),
              utilities: z.array(utilitySchema),
            }),
          },
        },
      },
      500: {
        description: 'Failed to retrieve overview',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/utils-docs/packages',
    summary: 'Get available packages',
    description:
      'Retrieve list of npm packages available for import in analysis scripts',
    tags: ['Utilities Documentation'],
    responses: {
      200: {
        description: 'Available packages retrieved successfully',
        content: {
          'application/json': {
            schema: z.array(packageSchema),
          },
        },
      },
      500: {
        description: 'Failed to retrieve packages',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/utils-docs/utilities',
    summary: 'Get utility OpenAPI documentation',
    description:
      'Retrieve OpenAPI specification for all in-process utility modules',
    tags: ['Utilities Documentation'],
    responses: {
      200: {
        description: 'Utility documentation retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              openapi: z.string().openapi({ example: '3.0.0' }),
              info: z.object({}).passthrough(),
              paths: z.object({}).passthrough(),
              components: z.object({}).passthrough(),
            }),
          },
        },
      },
      500: {
        description: 'Failed to retrieve utilities',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  });
}
