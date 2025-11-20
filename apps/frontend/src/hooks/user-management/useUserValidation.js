import { useCallback } from 'react';
import { authClient } from '../../lib/auth';
import logger from '../../utils/logger.js';
import {
  validateUsernameFormat,
  validateEmailUniqueness,
} from './utils/validation';

/**
 * Hook for managing async validation of user form fields
 */
export function useUserValidation({ editingUser, existingUserData }) {
  /**
   * Validate username format and check availability via API
   */
  const validateUsername = useCallback(
    async (username) => {
      if (!username) return null;

      // First check format
      const formatError = validateUsernameFormat(username);
      if (formatError) return formatError;

      // Skip availability check when editing
      if (editingUser) return null;

      // Check availability via API
      try {
        const response = await authClient.isUsernameAvailable({ username });
        return response.data?.available
          ? null
          : 'This username is already taken';
      } catch (error) {
        logger.error('Error checking username availability:', error);
        return 'Unable to verify username availability';
      }
    },
    [editingUser],
  );

  /**
   * Validate email format and uniqueness
   */
  const validateEmail = useCallback(
    (email) => {
      return validateEmailUniqueness(
        email,
        editingUser,
        existingUserData.emails,
      );
    },
    [editingUser, existingUserData.emails],
  );

  /**
   * Handle username blur to check async availability
   * Format validation is handled by form's validate object
   */
  const handleUsernameBlur = useCallback(
    async (value, form) => {
      // Only check availability if format is valid (no format errors from validate object)
      if (!value || form.errors.username) return;

      const error = await validateUsername(value);
      if (error) {
        form.setFieldError('username', error);
      }
    },
    [validateUsername],
  );

  return {
    validateUsername,
    validateEmail,
    handleUsernameBlur,
  };
}
