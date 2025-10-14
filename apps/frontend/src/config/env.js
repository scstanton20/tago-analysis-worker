/**
 * Centralized environment variable configuration for the frontend application.
 * All access to import.meta.env should go through this module to ensure
 * consistency and easier testing.
 *
 * @module config/env
 */

/**
 * Application mode (development or production)
 * @type {'development' | 'production'}
 */
export const MODE = import.meta.env.MODE;

/**
 * Whether the application is running in development mode
 * @type {boolean}
 */
export const isDevelopment = import.meta.env.DEV;

/**
 * Whether the application is running in production mode
 * @type {boolean}
 */
export const isProduction = import.meta.env.PROD;

/**
 * Custom API URL override (used in Docker development environments)
 * When set, this overrides the default API URL
 * @type {string | undefined}
 */
export const API_URL = import.meta.env.VITE_API_URL;

/**
 * Log level configuration (debug, info, warn, error)
 * Defaults to 'debug' in development and 'info' in production
 * @type {string}
 */
export const LOG_LEVEL =
  import.meta.env.VITE_LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

/**
 * Configuration object containing all environment variables
 * @type {Object}
 */
export const config = {
  mode: MODE,
  isDevelopment,
  isProduction,
  apiUrl: API_URL,
  logLevel: LOG_LEVEL,
};

export default config;
