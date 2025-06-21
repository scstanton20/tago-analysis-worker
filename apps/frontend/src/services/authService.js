import { fetchWithHeaders, handleResponse } from '../utils/apiUtils.js';

/**
 * Authentication service for handling user authentication and management on the frontend
 * Manages user sessions, profile updates, and user administration
 */
class AuthService {
  /**
   * Create a new AuthService instance
   */
  constructor() {
    this.user = null;
    this.token = this.getStoredToken();
  }

  /**
   * Login user with username and password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Login response with user data
   * @throws {Error} If login fails
   */
  async login(username, password) {
    const response = await fetchWithHeaders('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      credentials: 'include', // Include cookies in request
    });

    const data = await handleResponse(response);

    this.token = 'cookie-auth'; // Placeholder to indicate authenticated
    this.user = data.user;
    localStorage.setItem('auth_status', 'authenticated');

    return data;
  }

  /**
   * Force password change for users who must change their password
   * @param {string} username - Username
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Password change response
   * @throws {Error} If password change fails
   */
  async forceChangePassword(username, currentPassword, newPassword) {
    try {
      const response = await fetchWithHeaders('/auth/force-change-password', {
        method: 'POST',
        body: JSON.stringify({ username, currentPassword, newPassword }),
        credentials: 'include',
      });

      const data = await handleResponse(response);

      // Tokens are now set as httpOnly cookies by the server
      this.token = 'cookie-auth';
      this.user = data.user;
      localStorage.setItem('auth_status', 'authenticated');

      return data;
    } catch (error) {
      throw new Error(error.message || 'Password change failed');
    }
  }

  /**
   * Change password for authenticated user
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Password change response
   * @throws {Error} If password change fails
   */
  async changePassword(currentPassword, newPassword) {
    try {
      const response = await fetchWithHeaders('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: 'include',
      });

      const data = await handleResponse(response);

      this.user = data.user;
      localStorage.setItem('auth_status', 'authenticated');

      return data;
    } catch (error) {
      throw new Error(error.message || 'Password change failed');
    }
  }

  /**
   * Get authenticated user's profile
   * @returns {Promise<Object>} User profile data
   * @throws {Error} If request fails or user is not authenticated
   */
  async getProfile() {
    try {
      const response = await fetchWithHeaders('/auth/profile', {
        method: 'GET',
        credentials: 'include',
      });

      const data = await handleResponse(response);
      this.user = data.user;
      return data;
    } catch (error) {
      if (
        error.message.includes('Token expired') ||
        error.message.includes('Invalid token')
      ) {
        this.logout();
      }
      throw error;
    }
  }

  /**
   * Update authenticated user's profile
   * @param {string} username - New username
   * @param {string} email - New email
   * @returns {Promise<Object>} Updated user profile
   * @throws {Error} If update fails
   */
  async updateProfile(username, email) {
    try {
      const response = await fetchWithHeaders('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ username, email }),
        credentials: 'include',
      });

      const data = await handleResponse(response);
      this.user = data.user;
      return data;
    } catch (error) {
      throw new Error(error.message || 'Profile update failed');
    }
  }

  /**
   * Create a new user (admin only)
   * @param {Object} userData - User data
   * @param {string} userData.username - Username
   * @param {string} userData.email - Email
   * @param {string} [userData.role] - User role
   * @param {string[]} [userData.departments] - Department permissions
   * @param {string[]} [userData.actions] - Action permissions
   * @returns {Promise<Object>} Created user data with default password
   * @throws {Error} If user creation fails
   */
  async createUser(userData) {
    try {
      const response = await fetchWithHeaders('/auth/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        credentials: 'include',
      });

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'User creation failed');
    }
  }

  /**
   * Update user data (admin only)
   * @param {string} username - Username of user to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated user data
   * @throws {Error} If update fails
   */
  async updateUser(username, updates) {
    try {
      const response = await fetchWithHeaders(`/auth/users/${username}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
        credentials: 'include',
      });

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'User update failed');
    }
  }

  /**
   * Delete a user (admin only)
   * @param {string} username - Username of user to delete
   * @returns {Promise<Object>} Deletion confirmation
   * @throws {Error} If deletion fails
   */
  async deleteUser(username) {
    try {
      const response = await fetchWithHeaders(`/auth/users/${username}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'User deletion failed');
    }
  }

  /**
   * Get all users (admin only)
   * @returns {Promise<Object>} Response with users array
   * @throws {Error} If request fails
   */
  async getAllUsers() {
    try {
      const response = await fetchWithHeaders('/auth/users', {
        method: 'GET',
        credentials: 'include',
      });

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'Failed to fetch users');
    }
  }

  /**
   * Reset user password (admin only)
   * @param {string} username - Username of user to reset password for
   * @returns {Promise<Object>} Reset response with new password
   * @throws {Error} If reset fails
   */
  async resetUserPassword(username) {
    try {
      const response = await fetchWithHeaders(
        `/auth/users/${username}/reset-password`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'Password reset failed');
    }
  }

  /**
   * Get user permissions
   * @param {string} username - Username to get permissions for
   * @returns {Promise<Object>} User permissions
   * @throws {Error} If request fails
   */
  async getUserPermissions(username) {
    try {
      const response = await fetchWithHeaders(
        `/auth/users/${username}/permissions`,
        {
          method: 'GET',
          credentials: 'include',
        },
      );

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'Failed to get user permissions');
    }
  }

  /**
   * Update user permissions (admin only)
   * @param {string} username - Username to update permissions for
   * @param {Object} permissions - Permission updates
   * @param {string[]} permissions.departments - Department permissions
   * @param {string[]} permissions.actions - Action permissions
   * @returns {Promise<Object>} Updated user data
   * @throws {Error} If update fails
   */
  async updateUserPermissions(username, permissions) {
    try {
      const response = await fetchWithHeaders(
        `/auth/users/${username}/permissions`,
        {
          method: 'PUT',
          body: JSON.stringify(permissions),
          credentials: 'include',
        },
      );

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'Failed to update user permissions');
    }
  }

  /**
   * Get available departments for permission assignment
   * @returns {Promise<Object>} Response with departments array
   * @throws {Error} If request fails
   */
  async getAvailableDepartments() {
    try {
      const response = await fetchWithHeaders('/auth/departments', {
        method: 'GET',
        credentials: 'include',
      });

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'Failed to get departments');
    }
  }

  /**
   * Get available actions for permission assignment
   * @returns {Promise<Object>} Response with actions array
   * @throws {Error} If request fails
   */
  async getAvailableActions() {
    try {
      const response = await fetchWithHeaders('/auth/actions', {
        method: 'GET',
        credentials: 'include',
      });

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'Failed to get actions');
    }
  }

  /**
   * Get stored authentication token from localStorage
   * @returns {string|null} Token if authenticated, null otherwise
   */
  getStoredToken() {
    // Check if we have authentication status from previous login
    return localStorage.getItem('auth_status') === 'authenticated'
      ? 'cookie-auth'
      : null;
  }

  /**
   * Get stored refresh token (not used with httpOnly cookies)
   * @returns {null} Always returns null as refresh tokens are httpOnly cookies
   */
  getStoredRefreshToken() {
    return null;
  }

  /**
   * Logout user and clear authentication state
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      // Call logout endpoint to clear httpOnly cookies server-side
      await fetchWithHeaders('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with local cleanup even if server logout fails
    } finally {
      this.user = null;
      this.token = null;
      localStorage.removeItem('auth_status');
      // httpOnly cookies are cleared by the server
    }
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} True if user is authenticated
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Get current user data
   * @returns {Object|null} Current user data or null if not authenticated
   */
  getUser() {
    return this.user;
  }

  /**
   * Get current authentication token
   * @returns {string|null} Current token or null if not authenticated
   */
  getToken() {
    return this.token;
  }

  /**
   * Check if current user is an admin
   * @returns {boolean} True if user is an admin
   */
  isAdmin() {
    return this.user?.role === 'admin';
  }
}

export default new AuthService();
