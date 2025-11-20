/**
 * Hook for managing password changes
 * Handles password form state, validation, and submission
 * @module hooks/usePasswordManagement
 */

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { notificationAPI } from '../utils/notificationAPI.jsx';
import { useAsyncOperation } from './async';
import { useStandardForm } from './forms/useStandardForm';
import logger from '../utils/logger';
import { validatePassword } from '../validation';

/**
 * Hook for password management operations
 * @param {Object} params - Hook parameters
 * @param {string} params.activeTab - Current active tab
 * @param {Function} params.closeModal - Function to close the modal
 * @returns {Object} State and handlers for password management
 */
export function usePasswordManagement({ activeTab, closeModal }) {
  const { changeProfilePassword } = useAuth();

  // Success state
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Async operation
  const passwordOperation = useAsyncOperation({
    onError: (error) => logger.error('Password change error:', error),
  });

  // Form state using useStandardForm
  const passwordFormState = useStandardForm({
    initialValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    validate: {
      currentPassword: (value) =>
        !value ? 'Current password is required' : null,
      newPassword: (value) => {
        if (!value) return 'New password is required';
        return validatePassword(value);
      },
      confirmPassword: (value, values) => {
        if (!value) return 'Please confirm your password';
        return value !== values.newPassword ? 'Passwords do not match' : null;
      },
    },
    resetOnSuccess: false, // Manual reset in handler
  });

  /**
   * Handle password change submission
   */
  const handlePasswordSubmit = useCallback(
    async (values) => {
      setPasswordSuccess(false);

      // Validate that all required fields are present
      if (!values.currentPassword || !values.newPassword) {
        passwordOperation.setError('All password fields are required');
        return;
      }

      if (values.newPassword !== values.confirmPassword) {
        passwordOperation.setError('Passwords do not match');
        return;
      }

      await passwordOperation.execute(async () => {
        try {
          await notificationAPI.passwordChange(
            changeProfilePassword(values.currentPassword, values.newPassword),
          );

          setPasswordSuccess(true);
          passwordFormState.form.reset();

          // Auto-close after success
          setTimeout(() => {
            setPasswordSuccess(false);
            if (activeTab === 'password') {
              closeModal();
            }
          }, 2000);
        } catch (error) {
          // Provide more context for password errors
          const errorMessage = error.message || 'Failed to change password';
          if (
            errorMessage.toLowerCase().includes('invalid password') ||
            errorMessage.toLowerCase().includes('incorrect password') ||
            errorMessage.toLowerCase().includes('wrong password')
          ) {
            throw new Error(
              'Current password is incorrect. Please check and try again.',
            );
          }
          throw error;
        }
      });
    },
    [
      passwordOperation,
      changeProfilePassword,
      passwordFormState,
      activeTab,
      closeModal,
    ],
  );

  return {
    // State
    passwordLoading: passwordOperation.loading,
    passwordError: passwordOperation.error,
    passwordSuccess,
    passwordFormState,
    // Handlers
    handlePasswordSubmit,
    resetPasswordForm: passwordFormState.form.reset,
    clearPasswordSuccess: () => setPasswordSuccess(false),
  };
}
