import { fetchWithHeaders, handleResponse } from '../utils/apiUtils.js';

class AuthService {
  constructor() {
    this.user = null;
    this.token = this.getStoredToken();
    this.refreshTimer = null;
    this.REFRESH_INTERVAL = 12 * 60 * 1000; // 12 minutes

    // Refresh operation mutex and backoff
    this.isRefreshing = false;
    this.refreshPromise = null;
    this.refreshAttempts = 0;
    this.maxRefreshAttempts = 3;

    // Session fingerprinting
    this.sessionFingerprint = this.generateSessionFingerprint();

    // Start proactive refresh if already authenticated
    if (this.token) {
      this.startProactiveRefresh();
    }
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

    // Start proactive token refresh
    this.startProactiveRefresh();

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

      // Start proactive token refresh
      this.startProactiveRefresh();

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
    // Implement mutex to prevent concurrent refresh operations
    if (this.isRefreshing) {
      // Return the existing promise if refresh is already in progress
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this._performRefresh();

    try {
      const result = await this.refreshPromise;
      this.refreshAttempts = 0; // Reset attempts on success
      return result;
    } catch (error) {
      this.refreshAttempts++;
      throw error;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  async _performRefresh() {
    try {
      const options = {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Session-Fingerprint': this.sessionFingerprint,
        },
      };
      const response = await fetchWithHeaders('/auth/refresh', options);

      const data = await handleResponse(response, '/auth/refresh', options);

      // Validate session consistency
      if (
        data.sessionFingerprint &&
        data.sessionFingerprint !== this.sessionFingerprint
      ) {
        console.warn('Session fingerprint mismatch detected');
        this.logout();
        throw new Error('Session anomaly detected, please log in again');
      }

      this.user = data.user;
      this.token = 'cookie-auth';
      localStorage.setItem('auth_status', 'authenticated');
      localStorage.setItem('last_token_refresh', Date.now().toString());

      // Restart proactive token refresh after manual refresh
      this.startProactiveRefresh();

      return data;
    } catch (error) {
      // Enhanced error handling with exponential backoff
      if (
        error.message.includes('Invalid refresh token') ||
        error.message.includes('Refresh token expired') ||
        error.message.includes('Refresh token required') ||
        error.message.includes('Session anomaly')
      ) {
        this.logout();
        throw new Error('Session expired, please log in again');
      }

      // Implement exponential backoff for temporary failures
      if (this.refreshAttempts < this.maxRefreshAttempts) {
        const backoffDelay = Math.pow(2, this.refreshAttempts) * 1000; // 1s, 2s, 4s
        console.log(
          `Token refresh failed, retrying in ${backoffDelay}ms (attempt ${this.refreshAttempts + 1}/${this.maxRefreshAttempts})`,
        );

        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        return this._performRefresh();
      }

      // Max attempts reached, logout user
      this.logout();
      throw new Error('Unable to refresh session, please log in again');
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
      localStorage.removeItem('last_token_refresh');
      // httpOnly cookies are cleared by the server

      // Stop proactive token refresh
      this.stopProactiveRefresh();
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

  startProactiveRefresh() {
    // Clear any existing timer
    this.stopProactiveRefresh();

    // Only start if authenticated
    if (!this.isAuthenticated()) {
      return;
    }

    this.refreshTimer = setInterval(async () => {
      try {
        // Only refresh if page is visible and user is still authenticated
        if (document.visibilityState === 'visible' && this.isAuthenticated()) {
          await this.refreshToken();
          console.log('Token refreshed successfully');
        }
      } catch (error) {
        console.error('Proactive token refresh failed:', error);
        // If refresh fails, the refreshToken method will handle logout
      }
    }, this.REFRESH_INTERVAL);

    // Also refresh when page becomes visible after being hidden
    document.addEventListener(
      'visibilitychange',
      this.handleVisibilityChange.bind(this),
    );
  }

  stopProactiveRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange.bind(this),
    );
  }

  async handleVisibilityChange() {
    // When tab becomes visible, always attempt to refresh token to ensure session is valid
    if (document.visibilityState === 'visible' && this.isAuthenticated()) {
      // Only refresh if not already refreshing (mutex protection)
      if (!this.isRefreshing) {
        try {
          console.log('Refreshing token after tab became visible');
          await this.refreshToken();
          localStorage.setItem('last_token_refresh', Date.now().toString());
        } catch (error) {
          console.error('Token refresh on visibility change failed:', error);
          // The refreshToken method already handles logout on failure
        }
      }
    }
  }

  generateSessionFingerprint() {
    // Generate a unique fingerprint for this session
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
      timestamp: Date.now(),
    };

    return btoa(JSON.stringify(fingerprint));
  }

  validateSessionActivity() {
    // Validate session based on activity patterns
    const lastActivity = localStorage.getItem('last_activity');
    const lastRefresh = localStorage.getItem('last_token_refresh');
    const now = Date.now();

    if (lastActivity && lastRefresh) {
      const timeSinceActivity = now - parseInt(lastActivity);
      const timeSinceRefresh = now - parseInt(lastRefresh);

      // Detect anomalous patterns (e.g., token refresh without activity)
      if (timeSinceRefresh < timeSinceActivity - 60000) {
        // 1 minute tolerance
        console.warn(
          'Potential session anomaly: token refreshed without recent activity',
        );
        return false;
      }
    }

    // Update activity timestamp
    localStorage.setItem('last_activity', now.toString());
    return true;
  }
}

export default new AuthService();
