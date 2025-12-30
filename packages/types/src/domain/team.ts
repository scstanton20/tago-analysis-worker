/**
 * Team Domain Types
 *
 * Teams organize analyses and control user access permissions.
 */

/** Base team properties */
export type TeamBase = {
  /** Unique team identifier */
  id: string;
  /** Team display name */
  name: string;
  /** Hex color code (e.g., "#3B82F6") */
  color: string;
};

/** Full team entity as returned from database/API */
export type Team = TeamBase & {
  /** Display order (lower = higher priority) */
  orderIndex: number;
  /** System teams cannot be deleted (e.g., "Uncategorized") */
  isSystem: boolean;
  /** ISO timestamp of creation */
  createdAt?: string;
  /** ISO timestamp of last update */
  updatedAt?: string;
};

/** Team with user's permissions for that team */
export type TeamWithPermissions = Team & {
  /** Permissions the user has for this team */
  permissions: Array<string>;
};

/** Map of teams keyed by team ID */
export type TeamsMap = Record<string, Team>;
