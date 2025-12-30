import { createContext, useCallback, useMemo } from 'react';
import { showError, showInfo } from '@/utils/notificationService';
import { notificationAPI } from '@/utils/notificationAPI.jsx';
import { useEventListener } from '@/hooks/useEventListener';
import logger from '@/utils/logger.js';
import { useSession, signOut, authClient } from '../lib/auth.js';

const AuthContext = createContext();

export { AuthContext };

export const AuthProvider = ({ children }) => {
  const {
    data: session,
    isPending: sessionLoading,
    refetch: refetchSession,
  } = useSession();

  // Memoize user and session data extraction
  const authData = useMemo(() => {
    const user = session?.user || null;
    const sessionData = session?.session || null;
    const isAuthenticated = !!(session && user && sessionData);
    const isAdmin = user?.role === 'admin';
    const isOwner = user?.isOwner || false;
    const isImpersonating = !!sessionData?.impersonatedBy;

    return {
      user,
      session,
      sessionData,
      isAuthenticated,
      isLoading: sessionLoading,
      isAdmin,
      isOwner,
      isImpersonating,
      impersonatedBy: sessionData?.impersonatedBy || null,
    };
  }, [session, sessionLoading]);

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
  const handleForceLogout = useCallback(async (event) => {
    const reason = event.detail?.reason || 'Your session has been terminated';
    logger.log('Force logout event detected:', reason);

    // Show notification
    await showError(reason, 'Session Terminated');

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
  }, []);

  useEventListener('force-logout', handleForceLogout);

  // Auth functions using useCallback for side-effect functions
  const refetchSessionFn = useCallback(async () => {
    try {
      refetchSession();
      logger.log('✓ Session manually refetched');
    } catch (error) {
      logger.error('Error manually refetching session:', error);
      throw error;
    }
  }, [refetchSession]);

  const logout = useCallback(async () => {
    await notificationAPI.logout(signOut());
  }, []);

  const exitImpersonation = useCallback(async () => {
    try {
      const result = await authClient.admin.stopImpersonating();
      if (result.error) {
        throw new Error(result.error.message || 'Failed to exit impersonation');
      }
      // Refetch session to update the auth context
      await refetchSession();
      logger.log('✓ Session refreshed after exiting impersonation');
    } catch (error) {
      logger.error('Error exiting impersonation:', error);
      throw error;
    }
  }, [refetchSession]);

  const updateProfile = useCallback(
    async (profileData) => {
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
    [authData.user?.email, authData.user?.username],
  );

  const changeProfilePassword = useCallback(
    async (currentPassword, newPassword) => {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        throw new Error(result.error.message || 'Failed to change password');
      }

      // Show notification that user must log back in
      await showInfo(
        'Your password has been changed. You must log back in.',
        'Password Changed Successfully',
      );

      await signOut();

      // Automatically refresh the window after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);

      return result.data;
    },
    [],
  );

  // Memoize the complete context value
  const contextValue = useMemo(
    () => ({
      ...authData,
      refetchSession: refetchSessionFn,
      logout,
      exitImpersonation,
      updateProfile,
      changeProfilePassword,
    }),
    [
      authData,
      refetchSessionFn,
      logout,
      exitImpersonation,
      updateProfile,
      changeProfilePassword,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
