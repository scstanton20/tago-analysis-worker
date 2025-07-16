import { createContext, useContext, useEffect, useState } from 'react';
import { useSession, signOut, authClient } from '../lib/auth.js';
import { notifications } from '@mantine/notifications';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const { data: session, isPending: sessionLoading } = useSession();
  const [manualSession, setManualSession] = useState(null);

  // Use manual session if available, otherwise fall back to useSession hook
  const currentSession = manualSession || session;
  // Better Auth returns session data in nested structure
  const user = currentSession?.data?.user || currentSession?.user || null;
  const sessionData =
    currentSession?.data?.session || currentSession?.session || null;

  const isAuthenticated = !!(currentSession && user && sessionData);
  const isLoading = sessionLoading && !manualSession;

  // Listen for auth changes and manually fetch session
  useEffect(() => {
    const handleAuthChange = async () => {
      console.log('Auth change event detected, manually fetching session');

      try {
        // Manually fetch the current session
        const freshSession = await authClient.getSession();
        console.log('Fresh session data:', freshSession);
        setManualSession(freshSession);
      } catch (error) {
        console.error('Error fetching fresh session:', error);
        setManualSession(null);
      }
    };

    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, []);

  // Periodic session validation to detect revoked sessions
  useEffect(() => {
    if (!isAuthenticated) return;

    const validateSession = async () => {
      try {
        const freshSession = await authClient.getSession();

        // If we had a session but now we don't, it was revoked
        if (currentSession && !freshSession?.data?.session) {
          notifications.show({
            title: 'Session Expired',
            message:
              'Your session has been revoked by an administrator. Please log in again.',
            color: 'orange',
            autoClose: 5000,
          });

          // Clear manual session and redirect to login
          setManualSession(null);

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
  }, [isAuthenticated, currentSession]);

  // Profile and authentication functions
  const logout = async () => {
    await signOut();
    // Clear manual session state
    setManualSession(null);
  };

  const value = {
    user,
    session: currentSession,
    isAuthenticated,
    isLoading,
    isAdmin: user?.role === 'admin',
    isImpersonating: !!sessionData?.impersonatedBy,
    impersonatedBy: sessionData?.impersonatedBy || null,
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
