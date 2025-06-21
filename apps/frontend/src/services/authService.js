import { fetchWithHeaders, handleResponse } from '../utils/apiUtils.js';

class AuthService {
  constructor() {
    this.user = null;
    this.token = this.getStoredToken();
  }

  async login(username, password) {
    const response = await fetchWithHeaders('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      credentials: 'include', // Include cookies in request
    });

    const data = await handleResponse(response, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });

    this.token = 'cookie-auth'; // Placeholder to indicate authenticated
    this.user = data.user;
    localStorage.setItem('auth_status', 'authenticated');

    return data;
  }

  async passwordOnboarding(newPassword) {
    try {
      const options = {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
        credentials: 'include',
      };
      const response = await fetchWithHeaders(
        '/auth/password-onboarding',
        options,
      );

      const data = await handleResponse(
        response,
        '/auth/password-onboarding',
        options,
      );

      // Tokens are now set as httpOnly cookies by the server
      this.token = 'cookie-auth';
      this.user = data.user;
      localStorage.setItem('auth_status', 'authenticated');

      return data;
    } catch (error) {
      throw new Error(error.message || 'Password onboarding failed');
    }
  }

  async changeProfilePassword(currentPassword, newPassword) {
    try {
      const options = {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: 'include',
      };
      const response = await fetchWithHeaders(
        '/auth/profile/change-password',
        options,
      );

      const data = await handleResponse(
        response,
        '/auth/profile/change-password',
        options,
      );

      // Update user data
      this.user = data.user;
      localStorage.setItem('auth_status', 'authenticated');

      return data;
    } catch (error) {
      throw new Error(error.message || 'Password change failed');
    }
  }

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

  async getProfile() {
    try {
      const options = {
        method: 'GET',
        credentials: 'include',
      };
      const response = await fetchWithHeaders('/auth/profile', options);

      const data = await handleResponse(response, '/auth/profile', options);
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

  getStoredToken() {
    // Check if we have authentication status from previous login
    return localStorage.getItem('auth_status') === 'authenticated'
      ? 'cookie-auth'
      : null;
  }

  getStoredRefreshToken() {
    // Refresh tokens are stored as httpOnly cookies, not accessible to JS
    return 'cookie-refresh';
  }

  async refreshToken() {
    try {
      const options = {
        method: 'POST',
        credentials: 'include',
      };
      const response = await fetchWithHeaders('/auth/refresh', options);

      const data = await handleResponse(response, '/auth/refresh', options);

      this.user = data.user;
      this.token = 'cookie-auth';
      localStorage.setItem('auth_status', 'authenticated');

      return data;
    } catch (error) {
      // If refresh fails, user needs to log in again
      if (
        error.message.includes('Invalid refresh token') ||
        error.message.includes('Refresh token expired') ||
        error.message.includes('Refresh token required')
      ) {
        this.logout();
        throw new Error('Session expired, please log in again');
      }
      throw error;
    }
  }

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

  isAuthenticated() {
    return !!this.token;
  }

  getUser() {
    return this.user;
  }

  getToken() {
    return this.token;
  }

  isAdmin() {
    return this.user?.role === 'admin';
  }
}

export default new AuthService();
