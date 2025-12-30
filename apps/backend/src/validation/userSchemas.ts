// validation/userSchemas.js
import { z } from 'zod';
import { requiredId } from './shared.ts';

// Organization role enum
const organizationRoleSchema = z.enum(['admin', 'owner', 'member']);

// Team assignment schema matching existing validation
const teamAssignmentSchema = z.object({
  teamId: requiredId('teamId'),
  permissions: z.array(z.string()).optional().default([]),
});

export const userValidationSchemas = {
  /**
   * POST /api/users/add-to-organization - Add user to organization
   */
  addToOrganization: {
    body: z.object({
      userId: requiredId('userId'),
      organizationId: requiredId('organizationId'),
      role: organizationRoleSchema.default('member'),
    }),
  },

  /**
   * POST /api/users/assign-teams - Assign user to teams
   */
  assignUserToTeams: {
    body: z.object({
      userId: requiredId('userId'),
      teamAssignments: z.array(teamAssignmentSchema).default([]),
    }),
  },

  /**
   * PATCH /api/users/:userId/team-assignments - Update user team assignments
   */
  updateUserTeamAssignments: {
    params: z.object({
      userId: requiredId('userId'),
    }),
    body: z.object({
      teamAssignments: z.array(teamAssignmentSchema).default([]),
    }),
  },

  /**
   * PATCH /api/users/:userId/organization-role - Update user organization role
   * Note: organizationId can be null/undefined and will default to 'main' organization
   * Note: Team assignments should be updated via separate endpoints (assignUserToTeams, updateUserTeamAssignments)
   */
  updateUserOrganizationRole: {
    params: z.object({
      userId: requiredId('userId'),
    }),
    body: z.object({
      organizationId: z
        .string()
        .min(1, 'organizationId must not be empty')
        .nullable()
        .optional(),
      role: organizationRoleSchema,
    }),
  },

  /**
   * DELETE /api/users/:userId/organization - Remove user from organization
   * Note: organizationId can be null for orphaned users (users not in any organization)
   */
  removeUserFromOrganization: {
    params: z.object({
      userId: requiredId('userId'),
    }),
    body: z.object({
      organizationId: requiredId('organizationId').nullable(),
    }),
  },

  /**
   * POST /api/users/force-logout/:userId - Force logout a user
   */
  forceLogout: {
    params: z.object({
      userId: requiredId('userId'),
    }),
    body: z.object({
      reason: z.string().default('Your session has been terminated'),
    }),
  },
} as const;
