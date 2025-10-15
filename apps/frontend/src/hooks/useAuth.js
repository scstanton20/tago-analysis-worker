/**
 * Custom hook for accessing authentication context
 * @module hooks/useAuth
 */
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

/**
 * Hook for accessing authentication state and functions
 * Must be used within an AuthProvider context
 *
 * @returns {Object} Authentication context object
 * @throws {Error} If used outside AuthProvider
 *
 * @property {Object|null} user - Current authenticated user object
 * @property {boolean} isAuthenticated - Whether user is authenticated
 * @property {boolean} isAdmin - Whether user has admin role
 * @property {boolean} isLoading - Whether authentication is loading
 * @property {Function} login - Login function
 * @property {Function} logout - Logout function
 * @property {Function} refetchSession - Refresh session data
 * @property {Function} updatePassword - Update user password
 * @property {Function} addPasskey - Add new passkey for user
 * @property {Function} deletePasskey - Delete user passkey
 *
 * @example
 * function UserProfile() {
 *   const { user, isAdmin, logout } = useAuth();
 *
 *   return (
 *     <div>
 *       <p>Welcome, {user?.name || user?.username}</p>
 *       {isAdmin && <AdminPanel />}
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   );
 * }
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
