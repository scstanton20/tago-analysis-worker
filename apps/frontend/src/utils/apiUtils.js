/**
 * API utility functions for frontend service layer
 * Provides standardized HTTP client with authentication and error handling
 * @module utils/apiUtils
 */
import logger from './logger';

/**
 * Get the base URL for API requests based on environment
 * @private
 * @returns {string} Base URL for API requests
 */
const getBaseUrl = () => {
  if (import.meta.env.DEV && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL; // Use Docker URL in Docker dev
  }
  return '/api'; // Use /api prefix for local dev and production
};

/**
 * Enhanced fetch function with automatic header management
 * Includes credentials (cookies) and proper content-type handling
 * @param {string} url - API endpoint URL (relative to base URL)
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>} Fetch response object
 * @example
 * const response = await fetchWithHeaders('/users', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'John' })
 * });
 */
export async function fetchWithHeaders(url, options = {}) {
  const defaultHeaders = {
    Accept: 'application/json',
  };

  if (options.body && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const baseUrl = getBaseUrl();
  const fullUrl = `${baseUrl}${url}`;

  return fetch(fullUrl, {
    ...options,
    credentials: 'include', // Include cookies in requests
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });
}

/**
 * Singleton class to manage token refresh state and request queueing
 * Prevents race conditions and testing issues from module-level mutable state
 */
class TokenRefreshManager {
  constructor() {
    this.isRefreshing = false;
    this.refreshPromise = null;
    this.refreshQueue = [];
    this.MAX_QUEUE_SIZE = 50;
    this.REFRESH_TIMEOUT = 30000; // 30 seconds
  }

  /**
   * Process all queued requests after refresh completes
   * @param {Error|null} error - Error if refresh failed
   * @param {boolean} success - Whether refresh succeeded
   */
  processQueue(error, success = false) {
    this.refreshQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(success);
      }
    });
    this.refreshQueue = [];
  }

  /**
   * Reset refresh state (used for testing)
   */
  reset() {
    this.isRefreshing = false;
    this.refreshPromise = null;
    this.refreshQueue = [];
  }
}

// Export singleton instance
const tokenRefreshManager = new TokenRefreshManager();

/**
 * Parse error response safely
 * @param {Response} response - Fetch response object
 * @param {string} defaultMessage - Default error message if parsing fails
 * @returns {Promise<Object>} Error data object
 */
export async function parseErrorResponse(response, defaultMessage) {
  try {
    return await response.json();
  } catch {
    return { error: defaultMessage || response.statusText };
  }
}

/**
 * Handle fetch response with automatic error handling and token refresh
 * Processes responses, handles authentication errors with automatic token refresh,
 * manages request queueing during refresh, and provides consistent error handling
 *
 * @param {Response} response - Fetch response object to process
 * @param {string} originalUrl - Original request URL (for retry logic)
 * @param {RequestInit} originalOptions - Original fetch options (for retry logic)
 * @returns {Promise<Object>} Parsed JSON response data
 * @throws {Error} Various errors including authentication, password change required, etc.
 *
 * @description
 * Special status codes:
 * - 401: Triggers automatic token refresh and request retry (unless already refreshing or on auth endpoints)
 * - 428: Password change required - throws error with requiresPasswordChange flag
 *
 * Token refresh behavior:
 * - Prevents multiple simultaneous refresh attempts
 * - Queues requests during refresh (max 50 requests)
 * - Retries original request after successful refresh
 * - Includes 30-second timeout protection
 *
 * @example
 * const response = await fetchWithHeaders('/users');
 * const data = await handleResponse(response, '/users', {});
 */
export async function handleResponse(response, originalUrl, originalOptions) {
  if (!response.ok) {
    const errorData = await parseErrorResponse(response, response.statusText);

    // Handle 428 Precondition Required - Password change required
    if (response.status === 428 && errorData.requiresPasswordChange) {
      const error = new Error(errorData.error || 'Password change required');
      error.requiresPasswordChange = true;
      error.username = errorData.username;
      throw error;
    }

    // Handle 401 errors with automatic token refresh
    if (
      response.status === 401 &&
      !originalUrl?.includes('/auth/refresh') &&
      !originalUrl?.includes('/auth/login') &&
      !originalOptions?._retry
    ) {
      // Add retry flag to prevent infinite loops
      originalOptions._retry = true;

      // Check if we have a refresh token available (stored as httpOnly cookie)
      const hasRefreshToken =
        localStorage.getItem('auth_status') === 'authenticated';

      if (hasRefreshToken) {
        // If already refreshing, queue this request
        if (tokenRefreshManager.isRefreshing) {
          // Protect against request accumulation on slow networks
          if (
            tokenRefreshManager.refreshQueue.length >=
            tokenRefreshManager.MAX_QUEUE_SIZE
          ) {
            logger.warn(
              `Token refresh queue full (${tokenRefreshManager.refreshQueue.length} requests), rejecting new request`,
            );
            return Promise.reject(
              new Error(
                'Too many pending requests. Please wait and try again.',
              ),
            );
          }

          return new Promise((resolve, reject) => {
            tokenRefreshManager.refreshQueue.push({
              resolve: () => {
                // Retry the original request after refresh
                fetchWithHeaders(originalUrl, originalOptions)
                  .then((response) =>
                    handleResponse(response, originalUrl, originalOptions),
                  )
                  .then(resolve)
                  .catch(reject);
              },
              reject,
            });
          });
        }

        // Start the refresh process
        tokenRefreshManager.isRefreshing = true;

        if (!window.authService) {
          throw new Error('Auth service not available');
        }

        // Create timeout promise to prevent stuck refreshes
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            logger.error('Token refresh timeout after 30 seconds');
            reject(new Error('Token refresh timeout'));
          }, tokenRefreshManager.REFRESH_TIMEOUT);
        });

        // Race between actual refresh and timeout
        const actualRefresh = window.authService
          .refreshToken()
          .then((result) => {
            // Handle rate limited responses (still successful)
            if (result && result.rateLimited) {
              return true;
            }
            return true;
          });

        tokenRefreshManager.refreshPromise = Promise.race([
          actualRefresh,
          timeoutPromise,
        ])
          .then((result) => {
            // Reset the refresh state on success
            tokenRefreshManager.isRefreshing = false;
            tokenRefreshManager.refreshPromise = null;
            tokenRefreshManager.processQueue(null, true);
            return result;
          })
          .catch((error) => {
            // Reset the refresh state on failure
            tokenRefreshManager.isRefreshing = false;
            tokenRefreshManager.refreshPromise = null;
            tokenRefreshManager.processQueue(error, false);
            throw error;
          });

        try {
          // Wait for the refresh to complete
          await tokenRefreshManager.refreshPromise;

          // Retry the original request with the new token
          const retryResponse = await fetchWithHeaders(
            originalUrl,
            originalOptions,
          );
          return handleResponse(retryResponse, originalUrl, originalOptions);
        } catch {
          // If refresh fails, throw the original error
          throw new Error(errorData.error || response.statusText);
        }
      }
    }

    throw new Error(errorData.error || response.statusText);
  }
  return response.json();
}

/**
 * Download a file from a blob response
 * @param {string} fileName - Name for the downloaded file
 * @param {Blob} blob - Blob data to download
 * @param {string} extension - File extension (e.g., '.js', '.log')
 */
export function downloadBlob(fileName, blob, extension = '') {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}${extension}`;
  a.style.display = 'none';
  a.rel = 'noopener noreferrer';

  document.body.appendChild(a);
  a.click();

  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Service method wrapper with consistent error handling
 * @param {Function} fn - Service function to wrap
 * @param {string} operationName - Name of the operation for error messages
 * @returns {Function} Wrapped function with error handling
 */
export function withErrorHandling(fn, operationName) {
  return async function (...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      logger.error(`Failed to ${operationName}:`, error);
      const wrappedError = new Error(
        `Failed to ${operationName}: ${error.message}`,
      );
      wrappedError.cause = error; // Preserve original error and stack trace
      throw wrappedError;
    }
  };
}
