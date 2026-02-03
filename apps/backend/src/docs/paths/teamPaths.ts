import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import {
  z,
  teamSchema,
  teamRequestSchema,
  teamStructureSchema,
  moveItemRequestSchema,
  errorResponseSchema,
} from '@tago-analysis-worker/types/openapi';

const adminErrors = {
  401: {
    description: 'Authentication required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description: 'Admin access required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
} as const;

export function registerTeamPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/teams',
    summary: 'Get all teams',
    description:
      'Get all teams with custom properties from Better Auth team table',
    tags: ['Team Management'],
    responses: {
      200: {
        description: 'Teams retrieved successfully',
        content: {
          'application/json': {
            schema: z.array(teamSchema),
          },
        },
      },
      ...adminErrors,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/teams',
    summary: 'Create team with custom properties',
    description:
      'Create team in Better Auth table with custom properties (color, order)',
    tags: ['Team Management'],
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: teamRequestSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Team created successfully',
        content: {
          'application/json': { schema: teamSchema },
        },
      },
      400: {
        description: 'Invalid request data or team name already exists',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...adminErrors,
      409: {
        description: 'Team name already exists',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/teams/reorder',
    summary: 'Reorder teams',
    description: 'Update the display order of teams',
    tags: ['Team Management'],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              orderedIds: z
                .array(z.string())
                .openapi({ description: 'Array of team IDs in desired order' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Teams reordered successfully',
        content: {
          'application/json': {
            schema: z.object({ message: z.string() }),
          },
        },
      },
      ...adminErrors,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/teams/{id}',
    summary: 'Update team with custom properties',
    description: 'Update team in Better Auth table with custom properties',
    tags: ['Team Management'],
    request: {
      params: z.object({
        id: z.string().openapi({ description: 'Team ID to update' }),
      }),
      body: {
        required: true,
        content: {
          'application/json': { schema: teamRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Team updated successfully',
        content: {
          'application/json': { schema: teamSchema },
        },
      },
      400: {
        description: 'Invalid request data',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...adminErrors,
      404: {
        description: 'Team not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/teams/{id}',
    summary: 'Delete team with analysis migration',
    description: 'Handle analysis migration before team deletion',
    tags: ['Team Management'],
    request: {
      params: z.object({
        id: z.string().openapi({ description: 'Team ID to delete' }),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              moveAnalysesTo: z.string().default('uncategorized').openapi({
                description: "Team ID to move analyses to, or 'uncategorized'",
              }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Team deleted successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              message: z
                .string()
                .openapi({ example: 'Team deleted successfully' }),
              analysesMovedTo: z
                .string()
                .openapi({ description: 'Where analyses were moved to' }),
            }),
          },
        },
      },
      ...adminErrors,
      404: {
        description: 'Team not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/teams/{id}/count',
    summary: 'Get analysis count for team',
    description: 'Get the number of analyses assigned to a specific team',
    tags: ['Team Management'],
    request: {
      params: z.object({ id: z.string().openapi({ description: 'Team ID' }) }),
    },
    responses: {
      200: {
        description: 'Analysis count retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              count: z
                .number()
                .openapi({ description: 'Number of analyses in the team' }),
            }),
          },
        },
      },
      ...adminErrors,
      404: {
        description: 'Team not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/teams/analyses/{analysisId}/team',
    summary: 'Move analysis to different team',
    description: 'Move an analysis from one team to another',
    tags: ['Team Management'],
    request: {
      params: z.object({
        analysisId: z
          .string()
          .uuid()
          .openapi({ description: 'UUID of the analysis to move' }),
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              teamId: z.string().openapi({
                description: 'Target team ID to move the analysis to',
              }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Analysis moved successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              analysis: z
                .string()
                .openapi({ description: 'Name of the moved analysis' }),
              from: z.string().openapi({ description: 'Source team ID' }),
              to: z.string().openapi({ description: 'Target team ID' }),
            }),
          },
        },
      },
      400: {
        description: 'Invalid request data or missing teamId',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...adminErrors,
      404: {
        description: 'Analysis or team not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  // Folder routes
  registry.registerPath({
    method: 'post',
    path: '/teams/{teamId}/folders',
    summary: 'Create folder in team',
    description: "Create a new folder within a team's structure",
    tags: ['Team Management', 'Folders'],
    request: {
      params: z.object({
        teamId: z.string().openapi({ description: 'Team ID' }),
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().openapi({ description: 'Folder name' }),
              parentFolderId: z.string().nullable().openapi({
                description: 'Parent folder ID (null for root level)',
              }),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Folder created successfully',
        content: {
          'application/json': { schema: teamStructureSchema },
        },
      },
      400: {
        description: 'Invalid request data',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...adminErrors,
      404: {
        description: 'Team or parent folder not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/teams/{teamId}/folders/{folderId}',
    summary: 'Update folder',
    description: 'Update folder name or expanded state',
    tags: ['Team Management', 'Folders'],
    request: {
      params: z.object({
        teamId: z.string().openapi({ description: 'Team ID' }),
        folderId: z.string().openapi({ description: 'Folder ID' }),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z
                .string()
                .optional()
                .openapi({ description: 'New folder name' }),
              expanded: z
                .boolean()
                .optional()
                .openapi({ description: 'Folder expanded state' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Folder updated successfully',
        content: {
          'application/json': { schema: teamStructureSchema },
        },
      },
      400: {
        description: 'Invalid request data',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...adminErrors,
      404: {
        description: 'Team or folder not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/teams/{teamId}/folders/{folderId}',
    summary: 'Delete folder',
    description: 'Delete folder and move children to parent',
    tags: ['Team Management', 'Folders'],
    request: {
      params: z.object({
        teamId: z.string().openapi({ description: 'Team ID' }),
        folderId: z.string().openapi({ description: 'Folder ID' }),
      }),
    },
    responses: {
      200: {
        description: 'Folder deleted successfully',
        content: {
          'application/json': { schema: teamStructureSchema },
        },
      },
      ...adminErrors,
      404: {
        description: 'Team or folder not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/teams/{teamId}/items/move',
    summary: 'Move item in tree',
    description: 'Move an item (analysis or folder) within the team structure',
    tags: ['Team Management', 'Folders'],
    request: {
      params: z.object({
        teamId: z.string().openapi({ description: 'Team ID' }),
      }),
      body: {
        required: true,
        content: {
          'application/json': { schema: moveItemRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Item moved successfully',
        content: {
          'application/json': { schema: teamStructureSchema },
        },
      },
      400: {
        description: 'Invalid move operation',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...adminErrors,
      404: {
        description: 'Team or item not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });
}
