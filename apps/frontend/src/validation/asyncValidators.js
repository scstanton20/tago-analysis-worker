/**
 * Async validation utilities
 * @module validation/asyncValidators
 */

import { validateUsernameFormat } from '@/features/users/validation/userValidation';
import logger from '@/utils/logger.js';

/**
 * Create a username validator function with async availability check
 * @param {Function} authClient - Better Auth client for availability check
 * @param {boolean} isEditing - Whether we're editing an existing user
 * @returns {Function} Async validation function
 */
export function createUsernameValidator(authClient, isEditing) {
  return async (username) => {
    if (!username) return null; // Username is optional

    // First check format
    const formatError = validateUsernameFormat(username);
    if (formatError) return formatError;

    // Skip availability check when editing existing user
    if (isEditing) return null;

    // Check availability via API
    try {
      const response = await authClient.isUsernameAvailable({ username });
      return response.data?.available ? null : 'This username is already taken';
    } catch (error) {
      logger.error('Error checking username availability:', error);
      return 'Unable to verify username availability';
    }
  };
}

/**
 * Create a debounced async validator
 * Useful for expensive async validations (API calls)
 * @param {Function} validatorFn - Async validation function
 * @param {number} delay - Debounce delay in milliseconds (default: 300)
 * @returns {Function} Debounced validation function
 */
export function createDebouncedValidator(validatorFn, delay = 300) {
  let timeoutId = null;

  return (...args) => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        const result = await validatorFn(...args);
        resolve(result);
      }, delay);
    });
  };
}

/**
 * Combine multiple validators (runs sequentially, stops at first error)
 * @param {Array<Function>} validators - Array of validator functions
 * @returns {Function} Combined validator function
 */
export function combineValidators(...validators) {
  return async (value) => {
    for (const validator of validators) {
      const error = await validator(value);
      if (error) return error;
    }
    return null;
  };
}

/**
 * Create a validator that checks against a list of existing values
 * @param {Array<string>} existingValues - List of existing values
 * @param {string} fieldName - Name of the field for error message
 * @param {boolean} caseSensitive - Whether comparison is case-sensitive (default: false)
 * @returns {Function} Validator function
 */
export function createUniquenessValidator(
  existingValues,
  fieldName = 'This value',
  caseSensitive = false,
) {
  return (value) => {
    if (!value) return null;

    const normalizedValue = caseSensitive ? value : value.toLowerCase();
    const normalizedExisting = caseSensitive
      ? existingValues
      : existingValues.map((v) => v.toLowerCase());

    if (normalizedExisting.includes(normalizedValue)) {
      return `${fieldName} is already in use`;
    }

    return null;
  };
}
