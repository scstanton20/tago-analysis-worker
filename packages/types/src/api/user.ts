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
export interface CreateUserRequest {
  email: string;
  name: string;
  username?: string;
  password: string;
  role?: UserRole;
  organizationRole?: OrganizationRole;
  teamAssignments?: TeamAssignment[];
}

/** Create user response */
export interface CreateUserResponse {
  user: User;
  message: string;
}

/** Update user request */
export interface UpdateUserRequest {
  name?: string;
  email?: string;
  username?: string;
  role?: UserRole;
  organizationRole?: OrganizationRole;
}

/** Update user response */
export interface UpdateUserResponse {
  user: User;
}

/** Delete user response */
export interface DeleteUserResponse {
  message: string;
  userId: string;
}

/** List users response */
export interface ListUsersResponse {
  users: UserWithMembership[];
}

/** Get user response */
export interface GetUserResponse {
  user: UserWithMembership;
}

// ============================================================================
// PASSWORD MANAGEMENT
// ============================================================================

/** Change password request */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Change password response */
export interface ChangePasswordResponse {
  message: string;
}

/** Reset password request (admin) */
export interface ResetPasswordRequest {
  userId: string;
  newPassword: string;
  requireChange?: boolean;
}

/** Reset password response */
export interface ResetPasswordResponse {
  message: string;
  requiresChange: boolean;
}

// ============================================================================
// TEAM ASSIGNMENTS
// ============================================================================

/** Update team assignments request */
export interface UpdateTeamAssignmentsRequest {
  teamAssignments: TeamAssignment[];
}

/** Update team assignments response */
export interface UpdateTeamAssignmentsResponse {
  message: string;
  teamAssignments: TeamAssignment[];
}

/** Get user teams response */
export interface GetUserTeamsResponse {
  teams: Array<{
    id: string;
    name: string;
    color: string;
    permissions: string[];
  }>;
}

// ============================================================================
// PASSKEY MANAGEMENT
// ============================================================================

/** List passkeys response */
export interface ListPasskeysResponse {
  passkeys: Array<{
    id: string;
    name: string;
    createdAt: string;
    lastUsed?: string;
  }>;
}

/** Register passkey options response */
export interface RegisterPasskeyOptionsResponse {
  options: PublicKeyCredentialCreationOptions;
}

/** Register passkey request */
export interface RegisterPasskeyRequest {
  name: string;
  credential: PublicKeyCredential;
}

/** Register passkey response */
export interface RegisterPasskeyResponse {
  message: string;
  passkeyId: string;
}

/** Delete passkey response */
export interface DeletePasskeyResponse {
  message: string;
  passkeyId: string;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/** List sessions response */
export interface ListSessionsResponse {
  sessions: Array<{
    id: string;
    userAgent?: string;
    ipAddress?: string;
    createdAt: string;
    expiresAt: string;
    isCurrent: boolean;
  }>;
}

/** Revoke session response */
export interface RevokeSessionResponse {
  message: string;
  sessionId: string;
}

/** Revoke all sessions response */
export interface RevokeAllSessionsResponse {
  message: string;
  count: number;
}

// ============================================================================
// ORGANIZATION MANAGEMENT
// ============================================================================

/** Add user to organization request */
export interface AddUserToOrganizationRequest {
  userId: string;
  organizationId: string;
  role?: OrganizationRole;
}

/** Add user to organization response */
export interface AddUserToOrganizationResponse {
  success: boolean;
  message: string;
  userId: string;
  organizationId: string;
}

/** Update user organization role request */
export interface UpdateUserOrganizationRoleRequest {
  organizationId?: string;
  role: OrganizationRole;
}

/** Update user organization role response */
export interface UpdateUserOrganizationRoleResponse {
  success: boolean;
  message: string;
  userId: string;
  role: OrganizationRole;
}

/** Remove user from organization request */
export interface RemoveUserFromOrganizationRequest {
  organizationId?: string | null;
}

/** Remove user from organization response */
export interface RemoveUserFromOrganizationResponse {
  success: boolean;
  message: string;
  userId: string;
}

// ============================================================================
// TEAM ASSIGNMENT OPERATIONS
// ============================================================================

/** Assign user to teams request */
export interface AssignUserToTeamsRequest {
  userId: string;
  teamAssignments: TeamAssignment[];
}

/** Assignment operation result */
export interface AssignmentResult {
  teamId: string;
  permissions: string[] | undefined;
  status:
    | 'added'
    | 'updated'
    | 'removed'
    | 'error'
    | 'updated_permissions'
    | 'success';
  error?: string;
}

/** Assign user to teams response */
export interface AssignUserToTeamsResponse {
  success: boolean;
  data: {
    assignments: AssignmentResult[];
    errors: string[] | null;
  };
}

/** Get user teams for editing response */
export interface GetUserTeamsForEditResponse {
  success: boolean;
  data: {
    teams: Array<{
      id: string;
      name: string;
      permissions: string[];
    }>;
  };
}

/** Update user team assignments response */
export interface UpdateUserTeamAssignmentsResponse {
  success: boolean;
  data: {
    assignments: AssignmentResult[];
    errors: string[] | null;
  };
}

// ============================================================================
// FORCE LOGOUT
// ============================================================================

/** Force logout request */
export interface ForceLogoutRequest {
  reason?: string;
}

/** Force logout response */
export interface ForceLogoutResponse {
  success: boolean;
  data: {
    closedConnections: number;
  };
}
