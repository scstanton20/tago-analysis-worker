import { useMemo, useContext } from 'react';
import { useTeams } from '@/contexts/sseContext/index.js';
import { AuthContext } from '../AuthContext.jsx';
import { PermissionsContext } from './context.js';
import { StaticPermissionsContext } from './StaticPermissionsContext.js';
import { RealtimeTeamContext } from './RealtimeTeamContext.js';

/**
 * StaticPermissionsProvider - Provides auth-related permissions that don't change with SSE
 * This provider only re-renders when user/session data changes, not on SSE team updates
 *
 * All permission data now comes directly from the Better Auth session (customSession plugin),
 * eliminating the need for additional API calls.
 */
const StaticPermissionsProvider = ({ children }) => {
  const authContext = useContext(AuthContext);

  if (!authContext) {
    throw new Error(
      'StaticPermissionsProvider must be used within an AuthProvider',
    );
  }

  const { user, isAuthenticated, isAdmin, isOwner, session } = authContext;

  // All data comes directly from session (injected by Better Auth customSession plugin)
  const organizationId = session?.session?.activeOrganizationId || null;
  const userTeams = useMemo(() => session?.teams || [], [session?.teams]);

  // Derive organization membership role from session data
  const organizationMembership = useMemo(() => {
    if (!isAuthenticated || !user) return null;
    if (isOwner) return 'owner';
    if (user.role === 'admin') return 'admin';
    return 'member';
  }, [isAuthenticated, user, isOwner]);

  const staticContextValue = useMemo(
    () => ({
      // Core state values (all derived from session)
      organizationMembership,
      organizationId,
      userTeams,
      membershipLoading: false, // No longer needed - data comes from session
      isOwner,

      // Team helper functions
      isTeamMember: (teamId) => {
        if (user?.role === 'admin') return true;
        return userTeams.some((team) => team.id === teamId);
      },

      canAccessTeam: (teamId) => {
        if (user?.role === 'admin') return true;
        return userTeams.some((team) => team.id === teamId);
      },

      hasOrganizationRole: (allowedRoles) => {
        if (user?.role === 'admin') return true;
        return (
          organizationMembership &&
          allowedRoles.includes(organizationMembership)
        );
      },

      getUserAccessibleTeams: () => {
        if (user?.role === 'admin') {
          return {
            userTeams,
            isGlobalAdmin: true,
            hasFullAccess: true,
          };
        }
        return {
          userTeams,
          isGlobalAdmin: false,
          hasFullAccess: false,
        };
      },

      // Base permission functions
      checkUserPermission: (permission, teamId = null) => {
        if (!isAuthenticated || !user) return false;
        if (user.role === 'admin') return true;

        if (teamId) {
          const team = userTeams.find((t) => t.id === teamId);
          return team?.permissions?.includes(permission) || false;
        }

        return userTeams.some((team) => team.permissions?.includes(permission));
      },

      getTeamPermissions: (teamId) => {
        if (isAdmin) {
          return [
            'view_analyses',
            'run_analyses',
            'upload_analyses',
            'download_analyses',
            'edit_analyses',
            'delete_analyses',
          ];
        }

        const team = userTeams.find((t) => t.id === teamId);
        return team?.permissions || [];
      },

      // Refresh functions (now no-ops since data comes from session)
      // Session refresh happens via AuthContext when needed
      refreshMembership: async () => {},
      refreshUserData: async () => {},
    }),
    [
      organizationMembership,
      organizationId,
      userTeams,
      isOwner,
      isAuthenticated,
      user,
      isAdmin,
    ],
  );

  return (
    <StaticPermissionsContext.Provider value={staticContextValue}>
      {children}
    </StaticPermissionsContext.Provider>
  );
};

/**
 * RealtimeTeamProvider - Provides SSE-dependent team data
 * This provider re-renders when SSE team data updates
 */
const RealtimeTeamProvider = ({ children }) => {
  const { teams: sseTeams } = useTeams();
  const staticContext = useContext(StaticPermissionsContext);

  if (!staticContext) {
    throw new Error(
      'RealtimeTeamProvider must be used within StaticPermissionsProvider',
    );
  }

  const { userTeams } = staticContext;

  // Get isAdmin from AuthContext
  const authContext = useContext(AuthContext);
  const isAdmin = authContext?.isAdmin;

  // Memoize SSE-dependent helper - only changes when sseTeams updates
  const realtimeContextValue = useMemo(
    () => ({
      getTeamsWithPermission: (permission) => {
        if (isAdmin) {
          const sseTeamsObject = sseTeams || {};
          const sseTeamsArray = Object.values(sseTeamsObject);

          if (sseTeamsArray.length > 0) {
            return sseTeamsArray.map((sseTeam) => ({
              id: sseTeam.id,
              name: sseTeam.name,
              color: sseTeam.color,
              isSystem: sseTeam.isSystem,
              orderIndex: sseTeam.orderIndex,
              permissions: [
                'view_analyses',
                'run_analyses',
                'upload_analyses',
                'download_analyses',
                'edit_analyses',
                'delete_analyses',
              ],
            }));
          } else {
            return userTeams.map((team) => ({
              ...team,
              permissions: [
                'view_analyses',
                'run_analyses',
                'upload_analyses',
                'download_analyses',
                'edit_analyses',
                'delete_analyses',
              ],
            }));
          }
        }

        // For non-admin users, filter userTeams by permission and merge with SSE data
        const teamsWithPermission = userTeams.filter((team) =>
          team.permissions?.includes(permission),
        );

        // Merge permission data with real-time SSE team data
        const sseTeamsObject = sseTeams || {};
        return teamsWithPermission.map((userTeam) => {
          const sseTeam = sseTeamsObject[userTeam.id];
          if (!sseTeam) {
            return userTeam;
          }
          return {
            ...userTeam,
            name: sseTeam.name,
            color: sseTeam.color,
            isSystem: sseTeam.isSystem,
            orderIndex: sseTeam.orderIndex,
          };
        });
      },
    }),
    [isAdmin, userTeams, sseTeams],
  );

  return (
    <RealtimeTeamContext.Provider value={realtimeContextValue}>
      {children}
    </RealtimeTeamContext.Provider>
  );
};

/**
 * LegacyPermissionsProvider - Provides combined context for backward compatibility
 * Consumes both Static and Realtime contexts and combines them
 */
const LegacyPermissionsProvider = ({ children }) => {
  const staticContext = useContext(StaticPermissionsContext);
  const realtimeContext = useContext(RealtimeTeamContext);

  // Combine both contexts for backward compatibility
  const combinedContextValue = useMemo(
    () => ({
      ...staticContext,
      ...realtimeContext,
    }),
    [staticContext, realtimeContext],
  );

  return (
    <PermissionsContext.Provider value={combinedContextValue}>
      {children}
    </PermissionsContext.Provider>
  );
};

/**
 * PermissionsProvider - Main provider that composes all permission contexts
 *
 * Architecture:
 * - StaticPermissionsProvider: Auth-related data (doesn't re-render on SSE)
 * - RealtimeTeamProvider: SSE team data (re-renders on SSE updates)
 * - LegacyPermissionsProvider: Combined context for backward compatibility
 *
 * Components can use:
 * - usePermissions() - Full API (backward compatible)
 * - useStaticPermissions() - Only static auth data (optimized)
 * - useRealtimeTeams() - Only SSE team data (optimized)
 */
export const PermissionsProvider = ({ children }) => {
  return (
    <StaticPermissionsProvider>
      <RealtimeTeamProvider>
        <LegacyPermissionsProvider>{children}</LegacyPermissionsProvider>
      </RealtimeTeamProvider>
    </StaticPermissionsProvider>
  );
};
