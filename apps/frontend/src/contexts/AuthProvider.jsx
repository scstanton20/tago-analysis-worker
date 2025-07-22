import { createContext, useEffect, useState, useCallback } from 'react';
import { useSession, signOut, authClient } from '../lib/auth.js';
import { notifications } from '@mantine/notifications';
import PasswordOnboarding from '../components/auth/passwordOnboarding.jsx';
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils.js';

const AuthContext = createContext();

export { AuthContext };

export const AuthProvider = ({ children }) => {
  const {
    data: session,
    isPending: sessionLoading,
    refetch: refetchSession,
  } = useSession();
  const [organizationMembership, setOrganizationMembership] = useState(null);
  const [organizationId, setOrganizationId] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [showPasswordOnboarding, setShowPasswordOnboarding] = useState(false);
  const [passwordOnboardingUser, setPasswordOnboardingUser] = useState('');

  // Better Auth returns session data in nested structure
  const user = session?.data?.user || session?.user || null;
  const sessionData = session?.data?.session || session?.session || null;

  const isAuthenticated = !!(session && user && sessionData);
  const isLoading = sessionLoading;

  // Check if user requires password change from Better Auth session
  useEffect(() => {
    if (isAuthenticated && user?.requiresPasswordChange) {
      console.log(
        'AuthProvider: User requires password change:',
        user?.email || user?.username,
      );
      setShowPasswordOnboarding(true);
      setPasswordOnboardingUser(user?.username || user?.email || '');
    }
  }, [
    isAuthenticated,
    user?.requiresPasswordChange,
    user?.email,
    user?.username,
  ]);

  // Listen for auth changes and refetch session
  useEffect(() => {
    const handleAuthChange = async () => {
      console.log('Auth change event detected, refetching session');

      try {
        // Use Better Auth's refetch function to update session
        refetchSession();

        // Clear organization data when session changes
        setOrganizationMembership(null);
        setOrganizationId(null);
        setUserTeams([]);
      } catch (error) {
        console.error('Error refetching session:', error);
        setOrganizationMembership(null);
        setOrganizationId(null);
        setUserTeams([]);
      }
    };

    window.addEventListener('auth-change', handleAuthChange);

    return () => {
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, [refetchSession]);

  // Helper function to set active organization
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
        console.log(
          '✓ Set active organization and ID:',
          activeOrgResult.data.id,
        );
      } else {
        console.warn('Could not set active organization or get its data');
        setOrganizationId(null);
      }

      // Assume admin users have 'owner' role in organization
      // and regular users have 'member' role
      const orgRole = user.role === 'admin' ? 'owner' : 'member';
      setOrganizationMembership(orgRole);

      // Load user team memberships
      try {
        if (user.role === 'admin') {
          // Admins have access to all teams, but we still need to load team list
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
                role: 'owner', // Admins are considered owners of all teams
              })),
            );
            console.log(
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
              console.log(
                `✓ Loaded ${teamMembershipsData.data.teams.length} team memberships for user`,
              );
            } else {
              setUserTeams([]);
            }
          } catch (fetchError) {
            console.warn('Error fetching user team memberships:', fetchError);
            setUserTeams([]);
          }
        }
      } catch (teamsError) {
        console.warn('Error loading team memberships:', teamsError);
        setUserTeams([]);
      }
    } catch (error) {
      console.error('Error setting active organization:', error);
      setOrganizationMembership(null);
      setOrganizationId(null);
      setUserTeams([]);
    } finally {
      setMembershipLoading(false);
    }
  }, [isAuthenticated, user]);

  // Load user organization membership and teams when authenticated
  useEffect(() => {
    loadOrganizationData();
  }, [loadOrganizationData]);

  // Periodic session validation to detect revoked sessions
  useEffect(() => {
    if (!isAuthenticated) return;

    const validateSession = async () => {
      try {
        const freshSession = await authClient.getSession();

        // If we had a session but now we don't, it was revoked
        if (session && !freshSession?.data?.session) {
          notifications.show({
            title: 'Session Expired',
            message:
              'Your session has been revoked by an administrator. Please log in again.',
            color: 'orange',
            autoClose: 5000,
          });

          // Force a page refresh to ensure clean state
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      } catch (error) {
        console.error('Session validation error:', error);
      }
    };

    // Check session every 30 seconds
    const interval = setInterval(validateSession, 30000);

    return () => clearInterval(interval);
  }, [isAuthenticated, session]);

  // Team helper functions
  const isTeamMember = (teamId) => {
    // Global admins have access to all teams
    if (user?.role === 'admin') return true;

    // Check if user is a member of this team
    return userTeams.some((team) => team.id === teamId);
  };

  const canAccessTeam = (teamId) => {
    // Global admins can access any team
    if (user?.role === 'admin') return true;

    // Check if user is a member of the corresponding team
    return isTeamMember(teamId);
  };

  const hasOrganizationRole = (allowedRoles) => {
    // Global admins have access to everything
    if (user?.role === 'admin') return true;

    // Check organization role
    return (
      organizationMembership && allowedRoles.includes(organizationMembership)
    );
  };

  const getUserAccessibleTeams = () => {
    // Global admins can see all teams (would need separate API call)
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
  };

  const refreshMembership = useCallback(async () => {
    await loadOrganizationData();
  }, [loadOrganizationData]);

  // Force refresh all user data (session + team memberships)
  const refreshUserData = useCallback(async () => {
    try {
      // Use Better Auth's refetch function to update session
      console.log('Refreshing user data and session');
      refetchSession();

      // Clear and reload organization data
      setOrganizationMembership(null);
      setOrganizationId(null);
      setUserTeams([]);

      // Reload organization data with fresh session
      await loadOrganizationData();
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  }, [loadOrganizationData, refetchSession]);

  // Profile and authentication functions
  const logout = async () => {
    await signOut();
    // Clear organization data
    setOrganizationMembership(null);
    setOrganizationId(null);
    setUserTeams([]);
  };

  const value = {
    user,
    session: session,
    isAuthenticated,
    isLoading,
    isAdmin: user?.role === 'admin',
    isImpersonating: !!sessionData?.impersonatedBy,
    impersonatedBy: sessionData?.impersonatedBy || null,

    // Organization/team data and state
    organizationMembership,
    organizationId,
    userTeams,
    membershipLoading,

    // Team helper functions
    isTeamMember,
    canAccessTeam,
    hasOrganizationRole,
    getUserAccessibleTeams,
    refreshMembership,
    refreshUserData,

    // Auth functions
    logout,
    signOut: logout,
    exitImpersonation: async () => {
      try {
        const result = await authClient.admin.stopImpersonating();
        if (result.error) {
          throw new Error(
            result.error.message || 'Failed to exit impersonation',
          );
        }
        // Refresh the page to update the auth context
        window.location.reload();
      } catch (error) {
        console.error('Error exiting impersonation:', error);
        throw error;
      }
    },
    // Profile and password management using Better Auth
    updateProfile: async (profileData) => {
      try {
        // Update name first
        if (profileData.name) {
          console.log('Updating name:', profileData.name);
          const nameResult = await authClient.updateUser({
            name: profileData.name,
          });
          console.log('Name update result:', nameResult);
          if (nameResult.error) {
            throw new Error(
              nameResult.error.message || 'Failed to update name',
            );
          }
        }

        // Handle email change separately using Better Auth's changeEmail method
        if (profileData.email && profileData.email !== user?.email) {
          console.log('Changing email to:', profileData.email);
          const emailResult = await authClient.changeEmail({
            newEmail: profileData.email,
          });
          console.log('Email change result:', emailResult);
          if (emailResult.error) {
            throw new Error(
              emailResult.error.message || 'Failed to change email',
            );
          }
        }

        return { success: true };
      } catch (error) {
        console.error('Profile update error:', error);
        throw error;
      }
    },
    changeProfilePassword: async (currentPassword, newPassword) => {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        throw new Error(result.error.message || 'Failed to change password');
      }

      // Show notification that user must log back in
      notifications.show({
        title: 'Password Changed Successfully',
        message: 'Your password has been changed. You must log back in.',
        color: 'blue',
        autoClose: 3000,
      });

      await signOut();

      // Automatically refresh the window after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);

      return result.data;
    },
    passwordOnboarding: async (newPassword) => {
      try {
        console.log('🔐 Setting initial password via server-side API');

        // Use our server-side endpoint that handles both password setting and flag clearing
        const response = await fetchWithHeaders('/users/set-initial-password', {
          method: 'POST',
          body: JSON.stringify({
            newPassword: newPassword,
          }),
        });

        const result = await handleResponse(
          response,
          '/users/set-initial-password',
          { method: 'POST', body: JSON.stringify({ newPassword }) },
        );

        console.log('🔐 Password onboarding completed successfully:', result);
        return result;
      } catch (error) {
        console.error('Password onboarding error:', error);
        throw error;
      }
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showPasswordOnboarding && (
        <>
          <PasswordOnboarding
            username={passwordOnboardingUser}
            passwordOnboarding={value.passwordOnboarding}
            onSuccess={async () => {
              console.log('🚨 AuthProvider: PasswordOnboarding completed');
              setShowPasswordOnboarding(false);
              setPasswordOnboardingUser('');

              // Refresh session to remove requiresPasswordChange flag
              try {
                refetchSession();
                console.log('✓ Session refreshed after password change');
              } catch (error) {
                console.error(
                  'Error refreshing session after password change:',
                  error,
                );
              }
            }}
          />
        </>
      )}
    </AuthContext.Provider>
  );
};
