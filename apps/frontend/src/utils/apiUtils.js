// frontend/src/services/utils.js
const getBaseUrl = () => {
  if (import.meta.env.DEV && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL; // Use Docker URL in Docker dev
  }
  return '/api'; // Use /api prefix for local dev and production
};

export async function fetchWithHeaders(url, options = {}) {
  const defaultHeaders = {
    Accept: 'application/json',
  };

  if (options.body && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const baseUrl = getBaseUrl();
  return fetch(`${baseUrl}${url}`, {
    ...options,
    credentials: 'include', // Include cookies in requests
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });
}

// Track if we're currently refreshing to prevent infinite loops
let isRefreshing = false;
let refreshPromise = null;

export async function handleResponse(response, originalUrl, originalOptions) {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      throw new Error(response.statusText);
    }

    // Handle special cases
    if (errorData.mustChangePassword) {
      const error = new Error(errorData.error || 'Password change required');
      error.mustChangePassword = true;
      error.user = errorData.user;
      throw error;
    }

    // Handle 401 errors with automatic token refresh
    if (
      response.status === 401 &&
      !isRefreshing &&
      !originalUrl?.includes('/auth/refresh') &&
      !originalUrl?.includes('/auth/login')
    ) {
      // Avoid circular import by dynamically importing authService
      const { default: authService } = await import(
        '../services/authService.js'
      );

      // Check if we have a refresh token available
      if (authService.getStoredRefreshToken()) {
        // If we're not already refreshing, start the refresh process
        if (!refreshPromise) {
          isRefreshing = true;
          refreshPromise = authService
            .refreshToken()
            .then(() => {
              // Reset the refresh state on success
              isRefreshing = false;
              refreshPromise = null;
              return true;
            })
            .catch((error) => {
              // Reset the refresh state on failure
              isRefreshing = false;
              refreshPromise = null;
              throw error;
            });
        }

        try {
          // Wait for the refresh to complete
          await refreshPromise;

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
