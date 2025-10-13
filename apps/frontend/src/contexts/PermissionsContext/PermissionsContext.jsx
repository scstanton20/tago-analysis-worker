import { useState, useCallback, useMemo, useContext } from 'react';
import { authClient } from '../../lib/auth.js';
import { fetchWithHeaders, handleResponse } from '../../utils/apiUtils.js';
import { AuthContext } from '../AuthContext.jsx';
import { SSEContext } from '../sseContext/context.js';
import { PermissionsContext } from './context.js';
import { useInitialState } from '../../hooks/useInitialState.js';
import logger from '../../utils/logger.js';

export const PermissionsProvider = ({ children }) => {
  const authContext = useContext(AuthContext);
  const sseContext = useContext(SSEContext);

  if (!authContext) {
    throw new Error('PermissionsProvider must be used within an AuthProvider');
  }

  const { user, isAuthenticated, isAdmin } = authContext;

  const [organizationMembership, setOrganizationMembership] = useState(null);
  const [organizationId, setOrganizationId] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [membershipLoading, setMembershipLoading] = useState(false);

  // Memoize organization data loading function
  const loadOrganizationData = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setOrganizationMembership(null);
      setOrganizationId(null);
      setUserTeams([]);
      return;
    }

    try {
      setMembershipLoading(true);

      // Set the main organization as active and get its data
      const activeOrgResult = await authClient.organization.setActive({
        organizationSlug: 'main',
      });

      if (activeOrgResult.data) {
        setOrganizationId(activeOrgResult.data.id);
        logger.log(
          '✓ Set active organization and ID:',
          activeOrgResult.data.id,
        );
      } else {
        logger.warn('Could not set active organization or get its data');
        setOrganizationId(null);
      }

      // Assume admin users have 'owner' role in organization
      const orgRole = user.role === 'admin' ? 'owner' : 'member';
      setOrganizationMembership(orgRole);

      // Load user team memberships
      try {
        if (user.role === 'admin') {
          // Admins have access to all teams
          const teamsResult = await authClient.organization.listTeams({
            query: {
              organizationId: activeOrgResult.data?.id,
            },
          });

          if (teamsResult.data && Array.isArray(teamsResult.data)) {
            setUserTeams(
              teamsResult.data.map((team) => ({
                id: team.id,
                name: team.name,
                role: 'owner',
              })),
            );
            logger.log(
              `✓ Loaded ${teamsResult.data.length} teams for admin user`,
            );
          } else {
            setUserTeams([]);
          }
        } else {
          // For regular users, fetch their specific team memberships via API
          try {
            const teamMembershipsResponse = await fetchWithHeaders(
              `/users/${user.id}/team-memberships`,
            );

            const teamMembershipsData = await handleResponse(
              teamMembershipsResponse,
              `/users/${user.id}/team-memberships`,
              { credentials: 'include' },
            );

            if (
              teamMembershipsData.success &&
              teamMembershipsData.data?.teams
            ) {
              setUserTeams(teamMembershipsData.data.teams);
              logger.log(
                `✓ Loaded ${teamMembershipsData.data.teams.length} team memberships for user`,
              );
            } else {
              setUserTeams([]);
            }
          } catch (fetchError) {
            logger.warn('Error fetching user team memberships:', fetchError);
            setUserTeams([]);
          }
        }
      } catch (teamsError) {
        logger.warn('Error loading team memberships:', teamsError);
        setUserTeams([]);
      }
    } catch (error) {
      logger.error('Error setting active organization:', error);
      setOrganizationMembership(null);
      setOrganizationId(null);
      setUserTeams([]);
    } finally {
      setMembershipLoading(false);
    }
  }, [isAuthenticated, user]);

  // Load organization data when authentication state changes
  // Uses custom useInitialState hook to handle initialization pattern
  useInitialState(loadOrganizationData, null, {
    condition: isAuthenticated && user,
    resetCondition: !isAuthenticated || !user,
  });

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

  // Memoize permission calculation functions for better performance
  const permissionHelpers = useMemo(
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

      // Get teams where user has a specific permission
      getTeamsWithPermission: (permission) => {
        if (isAdmin) {
          const sseTeamsObject = sseContext?.teams || {};
          const sseTeamsArray = Object.values(sseTeamsObject);

          if (sseTeamsArray.length > 0) {
            return sseTeamsArray.map((sseTeam) => ({
              id: sseTeam.id,
              name: sseTeam.name,
              color: sseTeam.color,
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
        const sseTeamsObject = sseContext?.teams || {};
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
          };
        });
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
    [isAuthenticated, user, isAdmin, userTeams, sseContext?.teams],
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

          // Clear and reload organization data
          setOrganizationMembership(null);
          setOrganizationId(null);
          setUserTeams([]);

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
      organizationId,
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
