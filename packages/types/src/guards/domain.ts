/**
 * Domain Type Guards
 *
 * Runtime type guards for domain entities.
 */

import type { Analysis, AnalysisStatus } from '../domain/analysis.js';
import type { Team } from '../domain/team.js';
import type { LogEntry, LogLevel } from '../domain/log.js';
import type {
  User,
  UserRole,
  OrganizationRole,
  TeamPermission,
} from '../domain/user.js';

/** Valid analysis statuses */
const ANALYSIS_STATUSES: ReadonlyArray<AnalysisStatus> = [
  'stopped',
  'running',
  'error',
];

/** Valid log levels */
const LOG_LEVELS: ReadonlyArray<LogLevel> = [
  'log',
  'info',
  'warn',
  'error',
  'debug',
];

/** Valid user roles */
const USER_ROLES: ReadonlyArray<UserRole> = ['admin', 'user'];

/** Valid organization roles */
const ORG_ROLES: ReadonlyArray<OrganizationRole> = ['owner', 'admin', 'member'];

/** Valid team permissions */
const TEAM_PERMISSIONS: ReadonlyArray<TeamPermission> = [
  'view_analyses',
  'run_analyses',
  'upload_analyses',
  'download_analyses',
  'edit_analyses',
  'delete_analyses',
];

/** Check if value is a valid analysis status */
export function isAnalysisStatus(value: unknown): value is AnalysisStatus {
  return (
    typeof value === 'string' &&
    ANALYSIS_STATUSES.includes(value as AnalysisStatus)
  );
}

/** Check if value is a valid log level */
export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && LOG_LEVELS.includes(value as LogLevel);
}

/** Check if value is a valid user role */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

/** Check if value is a valid organization role */
export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return (
    typeof value === 'string' && ORG_ROLES.includes(value as OrganizationRole)
  );
}

/** Check if value is a valid team permission */
export function isTeamPermission(value: unknown): value is TeamPermission {
  return (
    typeof value === 'string' &&
    TEAM_PERMISSIONS.includes(value as TeamPermission)
  );
}

/** Check if value looks like an Analysis object */
export function isAnalysis(value: unknown): value is Analysis {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    isAnalysisStatus(obj.status)
  );
}

/** Check if value looks like a Team object */
export function isTeam(value: unknown): value is Team {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.color === 'string'
  );
}

/** Check if value looks like a LogEntry object */
export function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.sequence === 'number' &&
    typeof obj.timestamp === 'string' &&
    typeof obj.message === 'string'
  );
}

/** Check if value looks like a User object */
export function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.name === 'string' &&
    isUserRole(obj.role)
  );
}

/** Check if analysis is in a running state */
export function isAnalysisRunning(status: AnalysisStatus): boolean {
  return status === 'running';
}

/** Check if analysis is in a stopped state */
export function isAnalysisStopped(status: AnalysisStatus): boolean {
  return status === 'stopped';
}

/** Check if analysis is in an error state */
export function isAnalysisError(status: AnalysisStatus): boolean {
  return status === 'error';
}

/** Check if user has admin privileges */
export function isAdminUser(user: User): boolean {
  return user.role === 'admin';
}

/** Check if organization role has admin access */
export function hasOrgAdminAccess(role: OrganizationRole): boolean {
  return role === 'owner' || role === 'admin';
}

/** Check if permission array includes a specific permission */
export function hasPermission(
  permissions: ReadonlyArray<TeamPermission>,
  permission: TeamPermission,
): boolean {
  return permissions.includes(permission);
}

/** Check if permission array includes any of the specified permissions */
export function hasAnyPermission(
  permissions: ReadonlyArray<TeamPermission>,
  required: ReadonlyArray<TeamPermission>,
): boolean {
  return required.some((p) => permissions.includes(p));
}

/** Check if permission array includes all specified permissions */
export function hasAllPermissions(
  permissions: ReadonlyArray<TeamPermission>,
  required: ReadonlyArray<TeamPermission>,
): boolean {
  return required.every((p) => permissions.includes(p));
}
