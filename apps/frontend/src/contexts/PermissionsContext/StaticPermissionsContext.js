import { createContext } from 'react';

/**
 * StaticPermissionsContext - Auth-related permissions that don't change with SSE updates
 *
 * Contains:
 * - organizationMembership, organizationId
 * - userTeams (from session)
 * - membershipLoading
 * - teamHelpers (isTeamMember, canAccessTeam, hasOrganizationRole, getUserAccessibleTeams)
 * - basePermissionHelpers (checkUserPermission, getTeamPermissions)
 * - refreshMembership, refreshUserData
 */
export const StaticPermissionsContext = createContext();
