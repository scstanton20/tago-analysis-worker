import {
  fetchWithHeaders,
  handleResponse,
  withErrorHandling,
} from './apiUtils';
import { createLogger } from './logger';

/**
 * Create a logger instance for a service
 * @param {string} serviceName - Name of the service
 * @returns {Object} Logger instance
 */
export function createServiceLogger(serviceName) {
  return createLogger(serviceName);
}

/**
 * Create a standard service method with automatic logging and error handling
 * Reduces boilerplate by handling the common pattern:
 * - Debug log before request
 * - Fetch with headers
 * - Handle response
 * - Info log after success
 * - Error handling wrapper
 *
 * @param {Object} logger - Logger instance
 * @param {string} operationName - Human-readable operation name (e.g., 'create team')
 * @param {string} debugMessage - Message for debug log
 * @param {string} successMessage - Message for success log
 * @returns {Function} Function that creates the wrapped service method
 */
export function createStandardMethod(
  logger,
  operationName,
  debugMessage,
  successMessage,
) {
  return (url, options = {}) => {
    return withErrorHandling(async (...args) => {
      // Extract parameters for logging (passed as arguments to the method)
      const params = args.length > 0 ? args : undefined;

      logger.debug(
        debugMessage,
        params ? (Array.isArray(params) ? {} : params[0]) : undefined,
      );

      const response = await fetchWithHeaders(url, options);
      const result = await handleResponse(response);

      logger.info(successMessage, result);
      return result;
    }, operationName);
  };
}

/**
 * Create a simple JSON API method (most common pattern)
 * Automatically adds Content-Type: application/json header
 *
 * @param {Object} logger - Logger instance
 * @param {string} operationName - Operation name for error handling
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string|Function} url - URL or function that builds URL from args
 * @param {Function} getBody - Optional function to extract body from args
 * @param {Object} logConfig - Optional custom logging config
 * @returns {Function} Service method
 */
export function createJsonMethod(
  logger,
  operationName,
  method,
  url,
  getBody = null,
  logConfig = {},
) {
  const {
    debugMessage = `Executing ${operationName}`,
    successMessage = `${operationName} completed successfully`,
    getDebugParams = (...args) => (args.length === 1 ? args[0] : args),
    getSuccessParams = (result) => result,
  } = logConfig;

  return withErrorHandling(async (...args) => {
    // Log debug with parameters
    logger.debug(debugMessage, getDebugParams(...args));

    // Build URL if it's a function
    const actualUrl = typeof url === 'function' ? url(...args) : url;

    // Build request options
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    // Add body if needed
    if (getBody) {
      const body = getBody(...args);
      if (body !== null && body !== undefined) {
        options.body = JSON.stringify(body);
      }
    }

    const response = await fetchWithHeaders(actualUrl, options);
    const result = await handleResponse(response);

    logger.info(successMessage, getSuccessParams(result, ...args));
    return result;
  }, operationName);
}

/**
 * Shorthand for creating a GET method
 */
export function createGetMethod(logger, operationName, url, logConfig = {}) {
  return createJsonMethod(logger, operationName, 'GET', url, null, logConfig);
}

/**
 * Shorthand for creating a POST method
 */
export function createPostMethod(
  logger,
  operationName,
  url,
  getBody,
  logConfig = {},
) {
  return createJsonMethod(
    logger,
    operationName,
    'POST',
    url,
    getBody,
    logConfig,
  );
}

/**
 * Shorthand for creating a PUT method
 */
export function createPutMethod(
  logger,
  operationName,
  url,
  getBody,
  logConfig = {},
) {
  return createJsonMethod(
    logger,
    operationName,
    'PUT',
    url,
    getBody,
    logConfig,
  );
}

/**
 * Shorthand for creating a DELETE method
 */
export function createDeleteMethod(
  logger,
  operationName,
  url,
  getBody = null,
  logConfig = {},
) {
  return createJsonMethod(
    logger,
    operationName,
    'DELETE',
    url,
    getBody,
    logConfig,
  );
}
