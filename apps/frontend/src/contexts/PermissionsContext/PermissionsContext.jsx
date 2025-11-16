import { useState, useCallback, useMemo, useContext, useEffect } from 'react';
import { AuthContext } from '../AuthContext.jsx';
import { useTeams } from '../sseContext/index.js';
import { PermissionsContext } from './context.js';
import { useEventListener } from '../../hooks/useEventListener.js';
import logger from '../../utils/logger.js';

export const PermissionsProvider = ({ children }) => {
  const authContext = useContext(AuthContext);
  const { teams: sseTeams } = useTeams();

  if (!authContext) {
    throw new Error('PermissionsProvider must be used within an AuthProvider');
  }

  const { user, isAuthenticated, isAdmin, session } = authContext;

  const [organizationMembership, setOrganizationMembership] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(false);

  // Track user ID to detect user changes (including impersonation)
  const [currentUserId, setCurrentUserId] = useState(user?.id || null);

  // Derive organizationId directly from session instead of storing in state
  const organizationId = session?.session?.activeOrganizationId || null;

  // Get teams directly from session (injected by Better Auth customSession plugin)
  // Teams are at the root level of the session response
  const userTeams = useMemo(() => {
    return session?.teams || [];
  }, [session]);

  // Memoize organization data loading function
  const loadOrganizationData = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setOrganizationMembership(null);
      return;
    }

    try {
      setMembershipLoading(true);

      // Assume admin users have 'owner' role in organization
      const orgRole = user.role === 'admin' ? 'owner' : 'member';
      setOrganizationMembership(orgRole);

      // Teams are now loaded directly from session (see userTeams useMemo above)
      // No need for separate API call - Better Auth session callback injects teams
      const isAdminUser = user.role === 'admin';
      logger.log(
        `✓ Loaded ${userTeams.length} team memberships from session${isAdminUser ? ' (all teams for admin)' : ''}`,
      );
    } catch (error) {
      logger.error('Error loading organization data:', error);
      setOrganizationMembership(null);
    } finally {
      setMembershipLoading(false);
    }
  }, [isAuthenticated, user, userTeams.length]);

  // Watch for user ID changes (including impersonation) and reload permissions
  useEffect(() => {
    const newUserId = user?.id || null;

    // If user ID changed (including from one user to another during impersonation)
    if (isAuthenticated && newUserId && newUserId !== currentUserId) {
      logger.log(
        `User changed from ${currentUserId} to ${newUserId}, reloading permissions...`,
      );
      setCurrentUserId(newUserId);

      // Clear existing data and reload (teams come from session automatically)
      setOrganizationMembership(null);

      loadOrganizationData();
    } else if (!isAuthenticated && currentUserId) {
      // User logged out, clear user ID
      setCurrentUserId(null);
    }
  }, [user?.id, isAuthenticated, currentUserId, loadOrganizationData]);

  // Listen for auth-change events (triggered by permission updates)
  const handleAuthChangeForPermissions = useCallback(async () => {
    if (!isAuthenticated || !user) {
      return;
    }

    logger.log(
      'PermissionsContext: Auth change event detected, reloading permissions...',
    );

    // Clear existing data (teams come from session automatically)
    setOrganizationMembership(null);

    // Reload organization data
    await loadOrganizationData();
  }, [isAuthenticated, user, loadOrganizationData]);

  useEventListener('auth-change', handleAuthChangeForPermissions);

  // Memoize team helper functions to prevent recreating on every render
  const teamHelpers = useMemo(
    () => ({
      isTeamMember: (teamId) => {
        // Global admins have access to all teams
        if (user?.role === 'admin') return true;

        // Check if user is a member of this team
        return userTeams.some((team) => team.id === teamId);
      },

      canAccessTeam: (teamId) => {
        // Global admins can access any team
        if (user?.role === 'admin') return true;

        // Check if user is a member of the corresponding team
        return userTeams.some((team) => team.id === teamId);
      },

      hasOrganizationRole: (allowedRoles) => {
        // Global admins have access to everything
        if (user?.role === 'admin') return true;

        // Check organization role
        return (
          organizationMembership &&
          allowedRoles.includes(organizationMembership)
        );
      },

      getUserAccessibleTeams: () => {
        // Global admins can see all teams
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
    }),
    [user?.role, userTeams, organizationMembership],
  );

  // Memoize base permission functions that don't depend on SSE data
  // This prevents unnecessary re-computation when SSE teams update
  const basePermissionHelpers = useMemo(
    () => ({
      // Check if user has a specific permission based on their team memberships
      checkUserPermission: (permission, teamId = null) => {
        if (!isAuthenticated || !user) return false;

        // Admin has all permissions
        if (user.role === 'admin') return true;

        // If checking for a specific team, check only that team's permissions
        if (teamId) {
          const team = userTeams.find((t) => t.id === teamId);
          return team?.permissions?.includes(permission) || false;
        }

        // If no specific team, check if user has this permission in ANY of their teams
        return userTeams.some((team) => team.permissions?.includes(permission));
      },

      // Get permissions for a specific team
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
    }),
    [isAuthenticated, user, isAdmin, userTeams],
  );

  // Memoize SSE-dependent helper separately to avoid re-computing all helpers on SSE updates
  const sseEnhancedHelpers = useMemo(
    () => ({
      // Get teams where user has a specific permission (merges with SSE data for latest team info)
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
            // If SSE doesn't have this team yet, use userTeam data
            return userTeam;
          }
          // Merge SSE team data with user permissions
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

  // Combine base helpers with SSE-enhanced helpers
  const permissionHelpers = useMemo(
    () => ({
      ...basePermissionHelpers,
      ...sseEnhancedHelpers,
    }),
    [basePermissionHelpers, sseEnhancedHelpers],
  );

  // Memoize refresh functions
  const refreshFunctions = useMemo(
    () => ({
      refreshMembership: async () => {
        await loadOrganizationData();
      },

      refreshUserData: async () => {
        try {
          logger.log('Refreshing permissions and team data');

          // Clear and reload organization data (teams come from session automatically)
          setOrganizationMembership(null);

          // Reload organization data
          await loadOrganizationData();
        } catch (error) {
          logger.error('Error refreshing permissions data:', error);
        }
      },
    }),
    [loadOrganizationData],
  );

  // Memoize the complete context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      // Organization/team data and state
      organizationMembership,
      organizationId,
      userTeams,
      membershipLoading,

      // Team helper functions
      ...teamHelpers,

      // Permission helpers
      ...permissionHelpers,

      // Refresh functions
      ...refreshFunctions,
    }),
    [
      organizationMembership,
      organizationId, // Derived from session, will update when session changes
      userTeams,
      membershipLoading,
      teamHelpers,
      permissionHelpers,
      refreshFunctions,
    ],
  );

  return (
    <PermissionsContext.Provider value={contextValue}>
      {children}
    </PermissionsContext.Provider>
  );
};
