import { fetchWithHeaders, handleResponse } from '../utils/apiUtils.js';

class AuthService {
  constructor() {
    this.user = null;
    this.token = this.getStoredToken();
    this.refreshTimer = null;
    this.REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes

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
    localStorage.setItem('last_token_refresh', Date.now().toString());

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
      localStorage.setItem('last_token_refresh', Date.now().toString());

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

  async updateUser(userId, updates) {
    try {
      const response = await fetchWithHeaders(`/auth/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
        credentials: 'include',
      });

      return await handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'User update failed');
    }
  }

  async deleteUser(userId) {
    try {
      const response = await fetchWithHeaders(`/auth/users/${userId}`, {
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

  async resetUserPassword(userId) {
    try {
      const response = await fetchWithHeaders(
        `/auth/users/${userId}/reset-password`,
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

  async getUserPermissions(userId) {
    try {
      const response = await fetchWithHeaders(
        `/auth/users/${userId}/permissions`,
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

  async updateUserPermissions(userId, permissions) {
    try {
      const response = await fetchWithHeaders(
        `/auth/users/${userId}/permissions`,
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
    // Return existing promise if refresh is already in progress
    if (this.isRefreshing && this.refreshPromise) {
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
      // Emit refresh start event for coordination
      window.dispatchEvent(new CustomEvent('authRefreshStart'));

      const options = {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Session-Fingerprint': this.sessionFingerprint,
        },
      };
      const response = await fetchWithHeaders('/auth/refresh', options);

      const data = await handleResponse(response, '/auth/refresh', options);

      // Validate session consistency (if server provides fingerprint)
      if (
        data.sessionFingerprint &&
        data.sessionFingerprint !== this.sessionFingerprint
      ) {
        // For now, ignore fingerprint mismatches as they can occur during
        // page refresh, development reload, etc.
        // Uncomment below to enable strict fingerprint validation:
        // this.logout();
        // throw new Error('Session anomaly detected, please log in again');
      }

      this.user = data.user;
      this.token = 'cookie-auth';
      localStorage.setItem('auth_status', 'authenticated');
      localStorage.setItem('last_token_refresh', Date.now().toString());

      // Restart proactive token refresh after manual refresh
      this.startProactiveRefresh();

      // Emit refresh success event
      window.dispatchEvent(
        new CustomEvent('authRefreshSuccess', {
          detail: { user: data.user, timestamp: Date.now() },
        }),
      );

      return data;
    } catch (error) {
      // Emit refresh error event
      window.dispatchEvent(
        new CustomEvent('authRefreshError', {
          detail: { error: error.message, timestamp: Date.now() },
        }),
      );

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

      // Handle backend rate limiting (429 responses)
      if (
        error.message.includes('Too many refresh attempts') ||
        error.message.includes('Please wait')
      ) {
        // Extract retry-after time from error message if available
        const retryMatch = error.message.match(/(\d+)\s*seconds?/);
        const retryAfter = retryMatch ? parseInt(retryMatch[1]) * 1000 : 10000; // Default 10s

        // Return rate limited response with proper user data
        return {
          user: this.user,
          message: `Rate limited by server, retry in ${retryAfter / 1000}s`,
          rateLimited: true,
          hasValidUser: !!this.user,
          retryAfter,
        };
      }

      // Implement exponential backoff for temporary failures
      if (this.refreshAttempts < this.maxRefreshAttempts) {
        const backoffDelay = Math.pow(2, this.refreshAttempts) * 1000; // 1s, 2s, 4s

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
        }
      } catch {
        // If refresh fails, the refreshToken method will handle logout
      }
    }, this.REFRESH_INTERVAL);

    // Store bound function reference for proper cleanup
    this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
  }

  stopProactiveRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.boundVisibilityHandler) {
      document.removeEventListener(
        'visibilitychange',
        this.boundVisibilityHandler,
      );
      this.boundVisibilityHandler = null;
    }
  }

  async handleVisibilityChange() {
    if (document.visibilityState === 'visible' && this.isAuthenticated()) {
      // Wait for any ongoing refresh to complete
      if (this.isRefreshing && this.refreshPromise) {
        try {
          await this.refreshPromise;
          return;
        } catch {
          // Ongoing refresh failed, proceed with visibility refresh
        }
      }

      // Check if refresh is needed (respect rate limiting)
      const lastRefresh = localStorage.getItem('last_token_refresh');
      if (lastRefresh) {
        const timeSinceLastRefresh = Date.now() - parseInt(lastRefresh);
        if (timeSinceLastRefresh < 10000) {
          return;
        }
      }

      // Proceed with refresh if needed
      try {
        await this.refreshToken();
      } catch {
        // Visibility change refresh failed
      }
    }
  }

  generateSessionFingerprint() {
    // Generate a stable fingerprint for this browser/device (no timestamp)
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      platform: navigator.userAgentData?.platform || 'unknown',
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
        // 1 minute tolerance - potential session anomaly
        return false;
      }
    }

    // Update activity timestamp
    localStorage.setItem('last_activity', now.toString());
    return true;
  }
}

export default new AuthService();
