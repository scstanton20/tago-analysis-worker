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

export async function handleResponse(response) {
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

    throw new Error(errorData.error || response.statusText);
  }
  return response.json();
}
