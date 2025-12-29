/**
 * User Domain Types
 *
 * User entities managed by Better Auth with custom organization/team
 * membership and permissions.
 */

/** Organization-level roles */
export type OrganizationRole = 'owner' | 'admin' | 'member';

/** Global user roles */
export type UserRole = 'admin' | 'user';

/** Base user properties */
export interface UserBase {
  /** Unique user ID */
  id: string;
  /** User email address */
  email: string;
  /** Display name */
  name: string;
}

/** Full user entity */
export interface User extends UserBase {
  /** Username for login */
  username?: string;
  /** Global role (admin has full access) */
  role: UserRole;
  /** Whether user account is active */
  emailVerified?: boolean;
  /** Profile image URL */
  image?: string | null;
  /** Account creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
  /** Whether user must change password on next login */
  requiresPasswordChange?: boolean;
}

/** User with organization membership info */
export interface UserWithMembership extends User {
  /** Role in the organization */
  organizationRole: OrganizationRole;
  /** Organization ID */
  organizationId: string;
  /** Whether this user is the organization owner */
  isOwner?: boolean;
}

/** Team permission types */
export type TeamPermission =
  | 'view_analyses'
  | 'run_analyses'
  | 'upload_analyses'
  | 'download_analyses'
  | 'edit_analyses'
  | 'delete_analyses';

/** Team assignment with permissions */
export interface TeamAssignment {
  /** Team ID */
  teamId: string;
  /** Granted permissions for this team */
  permissions: TeamPermission[];
}

/** User's team memberships (from session) */
export interface UserTeam {
  /** Team ID */
  id: string;
  /** Team name */
  name: string;
  /** Team color */
  color?: string;
  /** Whether system team */
  isSystem?: boolean;
  /** Order index */
  orderIndex?: number;
  /** Permissions for this team */
  permissions: TeamPermission[];
}
