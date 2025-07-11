import { useEffect, useState } from 'react';
import authService from '../../services/authService.js';
import { AuthContext } from './context.js';

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userPermissions, setUserPermissions] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper function to update user state consistently
  const updateUserState = (userData) => {
    if (!userData) {
      console.warn('updateUserState called with null/undefined userData');
      return;
    }

    setUser(userData);
    const userPerms = userData.permissions;
    if (userPerms) {
      setUserPermissions({
        departments: userPerms.departments || [],
        actions: userPerms.actions || [],
        isAdmin: userData.role === 'admin',
      });
    } else {
      setUserPermissions(null);
    }
  };

  useEffect(() => {
    window.authService = authService;

    const initializeAuth = async () => {
      try {
        // Check if we have a stored authentication status
        const storedAuthStatus = localStorage.getItem('auth_status');

        if (storedAuthStatus === 'authenticated') {
          // Check if this is a recent login (within last 10 seconds)
          const lastRefresh = localStorage.getItem('last_token_refresh');
          const isRecentLogin =
            lastRefresh && Date.now() - parseInt(lastRefresh) < 10000;

          if (isRecentLogin && authService.user) {
            // Recent login with existing user data - no need to refresh
            updateUserState(authService.user);
            setIsAuthenticated(true);
          } else {
            // Always attempt to refresh/validate session on page load
            // This ensures we use available refresh tokens instead of logging out
            try {
              const refreshData = await authService.refreshToken();

              // If refresh succeeds, get fresh user profile
              if (!refreshData.rateLimited) {
                const profileData = await authService.getProfile();
                updateUserState(profileData.user);
                setIsAuthenticated(true);
              } else {
                // Rate limited but session is still valid
                // Only update state if we have valid user data
                if (refreshData.hasValidUser && refreshData.user) {
                  updateUserState(refreshData.user);
                  setIsAuthenticated(true);
                } else {
                  // No user data available, try getProfile as fallback
                  try {
                    const profileData = await authService.getProfile();
                    updateUserState(profileData.user);
                    setIsAuthenticated(true);
                  } catch {
                    authService.logout();
                  }
                }
              }
            } catch (refreshError) {
              // Only logout if refresh definitively fails (not network errors)
              if (
                refreshError.message.includes('expired') ||
                refreshError.message.includes('invalid') ||
                refreshError.message.includes('Session anomaly') ||
                refreshError.message.includes('log in again')
              ) {
                authService.logout();
              } else {
                // For network errors or temporary failures, try getProfile as fallback
                try {
                  const profileData = await authService.getProfile();
                  updateUserState(profileData.user);
                  setIsAuthenticated(true);
                } catch {
                  authService.logout();
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        authService.logout();
      } finally {
        setIsLoading(false);
      }
    };

    // Coordinated auth state checking
    const checkAuthState = () => {
      // Don't check if authService is currently refreshing
      if (authService.isRefreshing) {
        return;
      }

      if (!authService.isAuthenticated() && isAuthenticated) {
        // Auth service logged out, update context state
        setUser(null);
        setIsAuthenticated(false);
        setUserPermissions(null);
      }
    };

    // Refresh coordination event listeners
    const handleRefreshStart = () => {
      setIsRefreshing(true);
    };

    const handleRefreshSuccess = (event) => {
      const { user: userData } = event.detail;
      updateUserState(userData);
      setIsRefreshing(false);
    };

    const handleRefreshError = () => {
      setIsRefreshing(false);
      // Don't automatically logout here, let authService handle it
    };

    // Reduce polling frequency to avoid conflicts (5 seconds instead of 1)
    const authCheckInterval = setInterval(checkAuthState, 5000);

    // Add event listeners for refresh coordination
    window.addEventListener('authRefreshStart', handleRefreshStart);
    window.addEventListener('authRefreshSuccess', handleRefreshSuccess);
    window.addEventListener('authRefreshError', handleRefreshError);

    initializeAuth();

    return () => {
      clearInterval(authCheckInterval);
      window.removeEventListener('authRefreshStart', handleRefreshStart);
      window.removeEventListener('authRefreshSuccess', handleRefreshSuccess);
      window.removeEventListener('authRefreshError', handleRefreshError);
    };
  }, [isAuthenticated]);

  const login = async (username, password) => {
    const data = await authService.login(username, password);
    updateUserState(data.user);
    setIsAuthenticated(true);
    return data;
  };

  const loginWithPasskey = async (user) => {
    // Tokens are now handled as httpOnly cookies by the server
    authService.token = 'cookie-auth';
    authService.user = user;
    localStorage.setItem('auth_status', 'authenticated');
    localStorage.setItem('last_token_refresh', Date.now().toString());

    updateUserState(user);
    setIsAuthenticated(true);

    return { user };
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setIsAuthenticated(false);
    setUserPermissions(null);
  };

  const passwordOnboarding = async (newPassword) => {
    const data = await authService.passwordOnboarding(newPassword);
    updateUserState(data.user);
    setIsAuthenticated(true);
    return data;
  };

  const changeProfilePassword = async (currentPassword, newPassword) => {
    const data = await authService.changeProfilePassword(
      currentPassword,
      newPassword,
    );
    setUser(data.user);
    return data;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const data = await authService.changePassword(currentPassword, newPassword);
    setUser(data.user);
    return data;
  };

  const updateProfile = async (username, email) => {
    const data = await authService.updateProfile(username, email);
    setUser(data.user);
    return data;
  };

  const createUser = async (userData) => {
    return await authService.createUser(userData);
  };

  const updateUser = async (userId, updates) => {
    return await authService.updateUser(userId, updates);
  };

  const deleteUser = async (userId) => {
    return await authService.deleteUser(userId);
  };

  const getAllUsers = async () => {
    return await authService.getAllUsers();
  };

  const resetUserPassword = async (userId) => {
    return await authService.resetUserPassword(userId);
  };

  const getUserPermissions = async (userId) => {
    return await authService.getUserPermissions(userId);
  };

  const updateUserPermissions = async (userId, permissions) => {
    return await authService.updateUserPermissions(userId, permissions);
  };

  const getAvailableActions = async () => {
    return await authService.getAvailableActions();
  };

  // Permission checking utilities
  const hasPermission = (action) => {
    if (!userPermissions) return false;
    if (userPermissions.isAdmin) return true;
    return userPermissions.actions?.includes(action) || false;
  };

  const hasDepartmentAccess = (departmentId) => {
    if (!userPermissions) return false;
    if (userPermissions.isAdmin) return true;
    return userPermissions.departments?.includes(departmentId) || false;
  };

  const getAccessibleDepartments = () => {
    if (!userPermissions) return [];
    if (userPermissions.isAdmin) return []; // Empty array means all departments for admins
    return userPermissions.departments || [];
  };

  const refreshPermissions = async () => {
    if (!user?.username) return;
    try {
      // Get fresh user profile data which includes permissions
      const profileData = await authService.getProfile();
      setUser(profileData.user);

      // Extract permissions from updated profile
      const userPerms = profileData.user.permissions;
      if (userPerms) {
        setUserPermissions({
          departments: userPerms.departments || [],
          actions: userPerms.actions || [],
          isAdmin: profileData.user.role === 'admin',
        });
      } else {
        setUserPermissions(null);
      }
    } catch (error) {
      console.error('Failed to refresh user permissions:', error);
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated,
    isRefreshing,
    userPermissions,
    login,
    loginWithPasskey,
    logout,
    passwordOnboarding,
    changeProfilePassword,
    changePassword,
    updateProfile,
    createUser,
    updateUser,
    deleteUser,
    getAllUsers,
    resetUserPassword,
    getUserPermissions,
    updateUserPermissions,
    getAvailableActions,
    isAdmin: () => user?.role === 'admin',
    getToken: () => authService.getToken(),
    // Permission utilities
    hasPermission,
    hasDepartmentAccess,
    getAccessibleDepartments,
    refreshPermissions,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
