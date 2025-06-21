import { useEffect, useState } from 'react';
import authService from '../../services/authService.js';
import { AuthContext } from './context.js';

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userPermissions, setUserPermissions] = useState(null);

  useEffect(() => {
    // Make authService globally accessible for WebSocket session invalidation
    window.authService = authService;

    const initializeAuth = async () => {
      try {
        if (authService.isAuthenticated()) {
          const profileData = await authService.getProfile();
          setUser(profileData.user);
          setIsAuthenticated(true);

          // Extract permissions from user profile (avoid extra API call)
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
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        authService.logout();
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (username, password) => {
    const data = await authService.login(username, password);
    setUser(data.user);
    setIsAuthenticated(true);

    // Extract permissions from user data (avoid extra API call)
    const userPerms = data.user.permissions;
    if (userPerms) {
      setUserPermissions({
        departments: userPerms.departments || [],
        actions: userPerms.actions || [],
        isAdmin: data.user.role === 'admin',
      });
    } else {
      setUserPermissions(null);
    }

    return data;
  };

  const loginWithPasskey = async (user) => {
    // Tokens are now handled as httpOnly cookies by the server
    authService.token = 'cookie-auth';
    authService.user = user;
    localStorage.setItem('auth_status', 'authenticated');

    setUser(user);
    setIsAuthenticated(true);

    // Extract permissions from user data
    const userPerms = user.permissions;
    if (userPerms) {
      setUserPermissions({
        departments: userPerms.departments || [],
        actions: userPerms.actions || [],
        isAdmin: user.role === 'admin',
      });
    } else {
      setUserPermissions(null);
    }

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
    setUser(data.user);
    setIsAuthenticated(true);

    // Extract permissions from user data (avoid extra API call)
    const userPerms = data.user.permissions;
    if (userPerms) {
      setUserPermissions({
        departments: userPerms.departments || [],
        actions: userPerms.actions || [],
        isAdmin: data.user.role === 'admin',
      });
    } else {
      setUserPermissions(null);
    }

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

  const updateUser = async (username, updates) => {
    return await authService.updateUser(username, updates);
  };

  const deleteUser = async (username) => {
    return await authService.deleteUser(username);
  };

  const getAllUsers = async () => {
    return await authService.getAllUsers();
  };

  const resetUserPassword = async (username) => {
    return await authService.resetUserPassword(username);
  };

  const getUserPermissions = async (username) => {
    return await authService.getUserPermissions(username);
  };

  const updateUserPermissions = async (username, permissions) => {
    return await authService.updateUserPermissions(username, permissions);
  };

  // DEPRECATED: Use WebSocket departments context instead
  const getAvailableDepartments = async () => {
    console.warn(
      'getAvailableDepartments is deprecated. Use WebSocket departments context instead.',
    );
    return await authService.getAvailableDepartments();
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
    getAvailableDepartments,
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
