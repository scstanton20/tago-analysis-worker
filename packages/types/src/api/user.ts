/**
 * User API Types
 *
 * Request/response types for user management endpoints.
 */

import type {
  User,
  UserWithMembership,
  UserRole,
  OrganizationRole,
  TeamAssignment,
} from '../domain/user.js';

// ============================================================================
// USER CRUD
// ============================================================================

/** Create user request */
export type CreateUserRequest = {
  email: string;
  name: string;
  username?: string;
  password: string;
  role?: UserRole;
  organizationRole?: OrganizationRole;
  teamAssignments?: Array<TeamAssignment>;
};

/** Create user response */
export type CreateUserResponse = {
  user: User;
  message: string;
};

/** Update user request */
export type UpdateUserRequest = {
  name?: string;
  email?: string;
  username?: string;
  role?: UserRole;
  organizationRole?: OrganizationRole;
};

/** Update user response */
export type UpdateUserResponse = {
  user: User;
};

/** Delete user response */
export type DeleteUserResponse = {
  message: string;
  userId: string;
};

/** List users response */
export type ListUsersResponse = {
  users: Array<UserWithMembership>;
};

/** Get user response */
export type GetUserResponse = {
  user: UserWithMembership;
};

// ============================================================================
// PASSWORD MANAGEMENT
// ============================================================================

/** Change password request */
export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

/** Change password response */
export type ChangePasswordResponse = {
  message: string;
};

/** Reset password request (admin) */
export type ResetPasswordRequest = {
  userId: string;
  newPassword: string;
  requireChange?: boolean;
};

/** Reset password response */
export type ResetPasswordResponse = {
  message: string;
  requiresChange: boolean;
};

// ============================================================================
// TEAM ASSIGNMENTS
// ============================================================================

/** Update team assignments request */
export type UpdateTeamAssignmentsRequest = {
  teamAssignments: Array<TeamAssignment>;
};

/** Update team assignments response */
export type UpdateTeamAssignmentsResponse = {
  message: string;
  teamAssignments: Array<TeamAssignment>;
};

/** Get user teams response */
export type GetUserTeamsResponse = {
  teams: Array<{
    id: string;
    name: string;
    color: string;
    permissions: Array<string>;
  }>;
};

// ============================================================================
// PASSKEY MANAGEMENT
// ============================================================================

/** List passkeys response */
export type ListPasskeysResponse = {
  passkeys: Array<{
    id: string;
    name: string;
    createdAt: string;
    lastUsed?: string;
  }>;
};

/** Register passkey options response */
export type RegisterPasskeyOptionsResponse = {
  options: PublicKeyCredentialCreationOptions;
};

/** Register passkey request */
export type RegisterPasskeyRequest = {
  name: string;
  credential: PublicKeyCredential;
};

/** Register passkey response */
export type RegisterPasskeyResponse = {
  message: string;
  passkeyId: string;
};

/** Delete passkey response */
export type DeletePasskeyResponse = {
  message: string;
  passkeyId: string;
};

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/** List sessions response */
export type ListSessionsResponse = {
  sessions: Array<{
    id: string;
    userAgent?: string;
    ipAddress?: string;
    createdAt: string;
    expiresAt: string;
    isCurrent: boolean;
  }>;
};

/** Revoke session response */
export type RevokeSessionResponse = {
  message: string;
  sessionId: string;
};

/** Revoke all sessions response */
export type RevokeAllSessionsResponse = {
  message: string;
  count: number;
};

// ============================================================================
// ORGANIZATION MANAGEMENT
// ============================================================================

/** Add user to organization request */
export type AddUserToOrganizationRequest = {
  userId: string;
  organizationId: string;
  role?: OrganizationRole;
};

/** Add user to organization response */
export type AddUserToOrganizationResponse = {
  success: boolean;
  message: string;
  userId: string;
  organizationId: string;
};

/** Update user organization role request */
export type UpdateUserOrganizationRoleRequest = {
  organizationId?: string;
  role: OrganizationRole;
};

/** Update user organization role response */
export type UpdateUserOrganizationRoleResponse = {
  success: boolean;
  message: string;
  userId: string;
  role: OrganizationRole;
};

/** Remove user from organization request */
export type RemoveUserFromOrganizationRequest = {
  organizationId?: string | null;
};

/** Remove user from organization response */
export type RemoveUserFromOrganizationResponse = {
  success: boolean;
  message: string;
  userId: string;
};

// ============================================================================
// TEAM ASSIGNMENT OPERATIONS
// ============================================================================

/** Assign user to teams request */
export type AssignUserToTeamsRequest = {
  userId: string;
  teamAssignments: Array<TeamAssignment>;
};

/** Assignment operation result */
export type AssignmentResult = {
  teamId: string;
  permissions: Array<string> | undefined;
  status:
    | 'added'
    | 'updated'
    | 'removed'
    | 'error'
    | 'updated_permissions'
    | 'success';
  error?: string;
};

/** Assign user to teams response */
export type AssignUserToTeamsResponse = {
  success: boolean;
  data: {
    assignments: Array<AssignmentResult>;
    errors: Array<string> | null;
  };
};

/** Get user teams for editing response */
export type GetUserTeamsForEditResponse = {
  success: boolean;
  data: {
    teams: Array<{
      id: string;
      name: string;
      permissions: Array<string>;
    }>;
  };
};

/** Update user team assignments response */
export type UpdateUserTeamAssignmentsResponse = {
  success: boolean;
  data: {
    assignments: Array<AssignmentResult>;
    errors: Array<string> | null;
  };
};

// ============================================================================
// FORCE LOGOUT
// ============================================================================

/** Force logout request */
export type ForceLogoutRequest = {
  reason?: string;
};

/** Force logout response */
export type ForceLogoutResponse = {
  success: boolean;
  data: {
    closedConnections: number;
  };
};
