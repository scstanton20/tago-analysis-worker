import { createContext, useContext, useEffect, useState } from 'react';
import { useSession, signOut, authClient } from '../lib/auth.js';

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
    logout,
    signOut: logout,
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
      return result.data;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
