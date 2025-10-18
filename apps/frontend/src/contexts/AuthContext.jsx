import {
  createContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { useSession, signOut, authClient } from '../lib/auth.js';
import { notifications } from '@mantine/notifications';
import { useEventListener } from '../hooks/useEventListener';
import PasswordOnboarding from '../components/auth/passwordOnboarding.jsx';
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils.js';
import logger from '../utils/logger.js';

const AuthContext = createContext();

export { AuthContext };

export const AuthProvider = ({ children }) => {
  const {
    data: session,
    isPending: sessionLoading,
    refetch: refetchSession,
  } = useSession();

  const [showPasswordOnboarding, setShowPasswordOnboarding] = useState(false);
  const [passwordOnboardingUser, setPasswordOnboardingUser] = useState('');

  // Memoize user and session data extraction
  const authData = useMemo(() => {
    const user = session?.data?.user || session?.user || null;
    const sessionData = session?.data?.session || session?.session || null;
    const isAuthenticated = !!(session && user && sessionData);
    const isAdmin = user?.role === 'admin';
    const isImpersonating = !!sessionData?.impersonatedBy;

    return {
      user,
      session,
      sessionData,
      isAuthenticated,
      isLoading: sessionLoading,
      isAdmin,
      isImpersonating,
      impersonatedBy: sessionData?.impersonatedBy || null,
    };
  }, [session, sessionLoading]);

  // Check if user requires password change (derived state)
  const shouldShowPasswordOnboarding =
    authData.isAuthenticated && authData.user?.requiresPasswordChange;

  // Update password onboarding state when derived state changes
  // Moved to useEffect to prevent state updates during render phase
  useEffect(() => {
    if (shouldShowPasswordOnboarding && !showPasswordOnboarding) {
      logger.log(
        'AuthContext: User requires password change:',
        authData.user?.email || authData.user?.username,
      );
      setShowPasswordOnboarding(true);
      setPasswordOnboardingUser(
        authData.user?.username || authData.user?.email || '',
      );
    } else if (!shouldShowPasswordOnboarding && showPasswordOnboarding) {
      setShowPasswordOnboarding(false);
      setPasswordOnboardingUser('');
    }
  }, [shouldShowPasswordOnboarding, showPasswordOnboarding, authData.user]);

  // Listen for auth changes and refetch session
  const handleAuthChange = useCallback(async () => {
    logger.log('Auth change event detected, refetching session');
    try {
      refetchSession();
    } catch (error) {
      logger.error('Error refetching session:', error);
    }
  }, [refetchSession]);

  useEventListener('auth-change', handleAuthChange);

  // Listen for forced logout events
  const handleForceLogout = useCallback(
    async (event) => {
      const reason = event.detail?.reason || 'Your session has been terminated';
      logger.log('Force logout event detected:', reason);

      // Show notification
      notifications.show({
        title: 'Session Terminated',
        message: reason,
        color: 'red',
        autoClose: 5000,
      });

      // Sign out and reload
      try {
        await signOut();
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error) {
        logger.error('Error during forced logout:', error);
        // Still reload even if signOut fails
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    },
    [],
  );

  useEventListener('force-logout', handleForceLogout);

  // Memoize auth functions to prevent recreating on every render
  const authFunctions = useMemo(
    () => ({
      // Expose refetchSession for components that need to manually refresh session
      // (e.g., after impersonation or other server-side session changes)
      refetchSession: async () => {
        try {
          refetchSession();
          logger.log('✓ Session manually refetched');
        } catch (error) {
          logger.error('Error manually refetching session:', error);
          throw error;
        }
      },

      logout: async () => {
        await signOut();
      },

      exitImpersonation: async () => {
        try {
          const result = await authClient.admin.stopImpersonating();
          if (result.error) {
            throw new Error(
              result.error.message || 'Failed to exit impersonation',
            );
          }
          // Refetch session to update the auth context
          await refetchSession();
          logger.log('✓ Session refreshed after exiting impersonation');
        } catch (error) {
          logger.error('Error exiting impersonation:', error);
          throw error;
        }
      },

      updateProfile: async (profileData) => {
        try {
          // Update name first
          if (profileData.name) {
            logger.log('Updating name:', profileData.name);
            const nameResult = await authClient.updateUser({
              name: profileData.name,
            });
            logger.log('Name update result:', nameResult);
            if (nameResult.error) {
              throw new Error(
                nameResult.error.message || 'Failed to update name',
              );
            }
          }

          // Handle email change separately using Better Auth's changeEmail method
          if (profileData.email && profileData.email !== authData.user?.email) {
            logger.log('Changing email to:', profileData.email);
            const emailResult = await authClient.changeEmail({
              newEmail: profileData.email,
            });
            logger.log('Email change result:', emailResult);
            if (emailResult.error) {
              throw new Error(
                emailResult.error.message || 'Failed to change email',
              );
            }
          }
          // Handle username change separately using Better Auth's updateUser method
          if (
            profileData.username &&
            profileData.username !== authData.user?.username
          ) {
            logger.log('Changing username to:', profileData.username);
            const usernameResult = await authClient.updateUser({
              username: profileData.username,
            });
            logger.log('Username change result:', usernameResult);
            if (usernameResult.error) {
              throw new Error(
                usernameResult.error.message || 'Failed to change username',
              );
            }
          }
          return { success: true };
        } catch (error) {
          logger.error('Profile update error:', error);
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
          logger.log('🔐 Setting initial password via server-side API');

          // Use our server-side endpoint that handles both password setting and flag clearing
          const response = await fetchWithHeaders(
            '/users/set-initial-password',
            {
              method: 'POST',
              body: JSON.stringify({
                newPassword: newPassword,
              }),
            },
          );

          const result = await handleResponse(
            response,
            '/users/set-initial-password',
            { method: 'POST', body: JSON.stringify({ newPassword }) },
          );

          logger.log('🔐 Password onboarding completed successfully:', result);
          return result;
        } catch (error) {
          logger.error('Password onboarding error:', error);
          throw error;
        }
      },
    }),
    [authData.user?.email, authData.user?.username, refetchSession],
  );

  // Memoize the complete context value
  const contextValue = useMemo(
    () => ({
      ...authData,
      ...authFunctions,
    }),
    [authData, authFunctions],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      {showPasswordOnboarding && (
        <PasswordOnboarding
          username={passwordOnboardingUser}
          passwordOnboarding={contextValue.passwordOnboarding}
          onSuccess={async () => {
            logger.log('🚨 AuthContext: PasswordOnboarding completed');
            setShowPasswordOnboarding(false);
            setPasswordOnboardingUser('');

            // Refresh session to remove requiresPasswordChange flag
            try {
              refetchSession();
              logger.log('✓ Session refreshed after password change');
            } catch (error) {
              logger.error(
                'Error refreshing session after password change:',
                error,
              );
            }
          }}
        />
      )}
    </AuthContext.Provider>
  );
};
