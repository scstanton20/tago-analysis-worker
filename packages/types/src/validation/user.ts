/**
 * User Validation Schemas
 *
 * Zod schemas for user management validation.
 */

import { z } from 'zod';

/** User ID schema */
export const userIdSchema = z.string().min(1, 'User ID is required');

/** Email schema */
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address');

/** Password schema */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or less')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain at least one lowercase letter, one uppercase letter, and one number',
  );

/** Username schema */
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be 30 characters or less')
  .regex(
    /^[a-zA-Z0-9_]+$/,
    'Username can only contain letters, numbers, and underscores',
  )
  .optional();

/** Display name schema */
export const displayNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or less');

/** User role schema */
export const userRoleSchema = z.enum(['admin', 'user']);

/** Organization role schema */
export const organizationRoleSchema = z.enum(['owner', 'admin', 'member']);

/** Team permission schema */
export const teamPermissionSchema = z.enum([
  'view_analyses',
  'run_analyses',
  'upload_analyses',
  'download_analyses',
  'edit_analyses',
  'delete_analyses',
]);

/** Team assignment schema */
export const teamAssignmentSchema = z.object({
  teamId: z.string().min(1),
  permissions: z.array(teamPermissionSchema),
});

/** Create user request schema */
export const createUserSchema = z.object({
  email: emailSchema,
  name: displayNameSchema,
  username: usernameSchema,
  password: passwordSchema,
  role: userRoleSchema.optional(),
  organizationRole: organizationRoleSchema.optional(),
  teamAssignments: z.array(teamAssignmentSchema).optional(),
});

/** Update user request schema */
export const updateUserSchema = z.object({
  name: displayNameSchema.optional(),
  email: emailSchema.optional(),
  username: usernameSchema,
  role: userRoleSchema.optional(),
  organizationRole: organizationRoleSchema.optional(),
});

/** Change password request schema */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

/** Reset password request schema */
export const resetPasswordSchema = z.object({
  userId: userIdSchema,
  newPassword: passwordSchema,
  requireChange: z.boolean().optional(),
});

/** Update team assignments request schema */
export const updateTeamAssignmentsSchema = z.object({
  teamAssignments: z.array(teamAssignmentSchema),
});

/** Add team member request schema */
export const addTeamMemberSchema = z.object({
  userId: userIdSchema,
  permissions: z.array(teamPermissionSchema),
});

/** Update team member request schema */
export const updateTeamMemberSchema = z.object({
  permissions: z.array(teamPermissionSchema),
});

/** Export types from schemas */
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateTeamAssignmentsInput = z.infer<
  typeof updateTeamAssignmentsSchema
>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
export type TeamAssignment = z.infer<typeof teamAssignmentSchema>;
