import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import {
  z,
  teamAssignmentSchema,
  errorResponseSchema,
} from '@tago-analysis-worker/types/openapi';

const standardErrors = {
  400: {
    description: 'Invalid request data',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  401: {
    description: 'Authentication required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description: 'Admin access required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
} as const;

export function registerUserPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/users/add-to-organization',
    summary: 'Add user to organization',
    description:
      'Add a user to the main organization with specified role (admin only)',
    tags: ['User Management - Admin'],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              userId: z.string().openapi({
                description: 'ID of the user to add to organization',
              }),
              organizationId: z.string().openapi({
                description: 'ID of the organization to add user to',
              }),
              role: z
                .enum(['member', 'admin', 'owner'])
                .default('member')
                .openapi({
                  description: 'Role to assign to the user in the organization',
                }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User added to organization successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              data: z.object({}).passthrough().openapi({
                description: 'Organization membership data from Better Auth',
              }),
            }),
          },
        },
      },
      ...standardErrors,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/users/assign-teams',
    summary: 'Assign user to teams with permissions',
    description:
      'Assign a user to multiple teams with specific permissions (admin only)',
    tags: ['User Management - Admin'],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              userId: z
                .string()
                .openapi({ description: 'ID of the user to assign to teams' }),
              teamAssignments: z.array(teamAssignmentSchema).openapi({
                description: 'Array of team assignments with permissions',
              }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User assigned to teams successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              data: z.object({
                assignments: z.array(
                  z.object({
                    teamId: z.string(),
                    permissions: z.array(z.string()),
                    status: z.enum(['success', 'updated_permissions']),
                  }),
                ),
                errors: z.array(z.string()).openapi({
                  description: 'Any errors encountered during assignment',
                }),
              }),
            }),
          },
        },
      },
      ...standardErrors,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/users/force-logout/{userId}',
    summary: 'Force logout a user',
    description:
      'Force logout a user by closing all their SSE connections and sending a logout notification (admin only)',
    tags: ['User Management - Admin'],
    request: {
      params: z.object({
        userId: z
          .string()
          .openapi({ description: 'ID of the user to force logout' }),
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              reason: z
                .string()
                .default('Your session has been terminated')
                .openapi({ description: 'Reason for forcing logout' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User forced logout successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              data: z.object({
                closedConnections: z
                  .number()
                  .openapi({ description: 'Number of SSE connections closed' }),
              }),
            }),
          },
        },
      },
      ...standardErrors,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/{userId}/teams/edit',
    summary: `Edit user's teams`,
    description:
      'Get team memberships for a user when editing. Admin-only endpoint.',
    tags: ['User Management - Admin'],
    request: {
      params: z.object({
        userId: z.string().openapi({ description: 'User ID' }),
      }),
    },
    responses: {
      200: { description: 'Team memberships retrieved' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden - admin only' },
      404: { description: 'User not found' },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/users/{userId}/team-assignments',
    summary: 'Update user team assignments',
    description:
      "Update a user's team assignments, removing them from old teams and adding to new ones (admin only)",
    tags: ['User Management - Admin'],
    request: {
      params: z.object({
        userId: z.string().openapi({
          description: 'ID of the user to update team assignments for',
        }),
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              teamAssignments: z.array(teamAssignmentSchema).openapi({
                description:
                  'Complete list of team assignments with permissions',
              }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User team assignments updated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              data: z.object({
                assignments: z.array(
                  z.object({
                    teamId: z.string(),
                    permissions: z.array(z.string()),
                    status: z.enum(['success', 'updated_permissions']),
                  }),
                ),
                errors: z.array(z.string()).openapi({
                  description: 'Any errors encountered during update',
                }),
              }),
            }),
          },
        },
      },
      ...standardErrors,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/users/{userId}/organization-role',
    summary: 'Update user organization role',
    description: "Update a user's role within the organization (admin only)",
    tags: ['User Management - Admin'],
    request: {
      params: z.object({
        userId: z.string().openapi({ description: 'ID of the user to update' }),
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              organizationId: z
                .string()
                .openapi({ description: 'ID of the organization' }),
              role: z
                .enum(['member', 'admin', 'owner'])
                .openapi({ description: 'New role for the user' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User organization role updated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              data: z.object({}).passthrough().openapi({
                description: 'Updated membership data from Better Auth',
              }),
            }),
          },
        },
      },
      ...standardErrors,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/users/{userId}/organization',
    summary: 'Remove user from organization and delete user',
    description:
      'Remove a user from the organization (admin only). Due to single-organization architecture, this automatically deletes the user entirely via the afterRemoveMember hook.',
    tags: ['User Management - Admin'],
    request: {
      params: z.object({
        userId: z.string().openapi({
          description: 'ID of the user to remove from organization and delete',
        }),
      }),
    },
    responses: {
      200: {
        description: 'User removed from organization and deleted successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              message: z
                .string()
                .openapi({ example: 'User removed from organization' }),
            }),
          },
        },
      },
      ...standardErrors,
    },
  });
}
