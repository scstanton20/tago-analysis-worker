import { fetchWithHeaders, handleResponse } from '../utils/apiUtils.js';
import Cookies from 'js-cookie';

const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

class AuthService {
  constructor() {
    this.user = null;
    this.token = this.getStoredToken();
  }

  async login(username, password) {
    const response = await fetchWithHeaders('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    const data = await handleResponse(response);

    this.setTokens(data.accessToken, data.refreshToken);
    this.user = data.user;

    return data;
  }

  async forceChangePassword(username, currentPassword, newPassword) {
    try {
      const response = await fetchWithHeaders('/auth/force-change-password', {
        method: 'POST',
        body: JSON.stringify({ username, currentPassword, newPassword }),
      });

      const data = await handleResponse(response);

      this.setTokens(data.accessToken, data.refreshToken);
      this.user = data.user;

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
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      const data = await handleResponse(response);

      // Update tokens if they were refreshed
      if (data.accessToken && data.refreshToken) {
        this.setTokens(data.accessToken, data.refreshToken);
        this.user = data.user;
      }

      return data;
    } catch (error) {
      throw new Error(error.message || 'Password change failed');
    }
  }

  async getProfile() {
    try {
      const response = await fetchWithHeaders('/auth/profile', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
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

  async createUser(userData) {
    try {
      const response = await fetchWithHeaders('/auth/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
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
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
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
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
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
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
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
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
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
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
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
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
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
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
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
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'Failed to get actions');
    }
  }

  setTokens(accessToken, refreshToken) {
    this.token = accessToken;

    // Store in cookies only
    const cookieOptions = {
      expires: 1, // 1 day
      secure: window.location.protocol === 'https:',
      sameSite: 'strict',
      path: '/',
    };

    Cookies.set(TOKEN_KEY, accessToken, cookieOptions);

    if (refreshToken) {
      Cookies.set(REFRESH_TOKEN_KEY, refreshToken, {
        ...cookieOptions,
        expires: 7, // 7 days
      });
    }
  }

  getStoredToken() {
    return Cookies.get(TOKEN_KEY);
  }

  getStoredRefreshToken() {
    return Cookies.get(REFRESH_TOKEN_KEY);
  }

  async logout() {
    try {
      // Call logout endpoint to invalidate token server-side
      if (this.token) {
        await fetchWithHeaders('/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with local cleanup even if server logout fails
    } finally {
      this.user = null;
      this.token = null;
      Cookies.remove(TOKEN_KEY, { path: '/' });
      Cookies.remove(REFRESH_TOKEN_KEY, { path: '/' });
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
