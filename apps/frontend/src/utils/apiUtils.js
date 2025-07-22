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

// Track if we're currently refreshing to prevent infinite loops
let isRefreshing = false;
let refreshPromise = null;

// Queue for pending requests during refresh
let refreshQueue = [];

const processQueue = (error, success = false) => {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(success);
    }
  });
  refreshQueue = [];
};

export async function handleResponse(response, originalUrl, originalOptions) {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      throw new Error(response.statusText);
    }

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
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            refreshQueue.push({
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
        isRefreshing = true;

        if (!window.authService) {
          throw new Error('Auth service not available');
        }

        refreshPromise = window.authService
          .refreshToken()
          .then((result) => {
            // Reset the refresh state on success
            isRefreshing = false;
            refreshPromise = null;

            // Handle rate limited responses (still successful)
            if (result && result.rateLimited) {
              processQueue(null, true);
              return true;
            }

            processQueue(null, true);
            return true;
          })
          .catch((error) => {
            // Reset the refresh state on failure
            isRefreshing = false;
            refreshPromise = null;
            processQueue(error, false);
            throw error;
          });

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
