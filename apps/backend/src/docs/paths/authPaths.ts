import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import {
  sessionSchema,
  errorResponseSchema,
} from '@tago-analysis-worker/types/openapi';

export function registerAuthPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/auth/get-session',
    summary: 'Get current user session',
    description:
      "Retrieve the current authenticated user's session information including user details and session metadata.\nThis endpoint is provided by Better-Auth and uses cookie-based authentication.\n\n**Note**: This endpoint is handled by Better-Auth middleware, not a custom implementation.",
    tags: ['Better-Auth'],
    responses: {
      200: {
        description: 'Session retrieved successfully',
        content: {
          'application/json': { schema: sessionSchema },
        },
      },
      401: {
        description: 'No valid session found - user not authenticated',
        content: {
          'application/json': { schema: errorResponseSchema },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': { schema: errorResponseSchema },
        },
      },
    },
  });
}
