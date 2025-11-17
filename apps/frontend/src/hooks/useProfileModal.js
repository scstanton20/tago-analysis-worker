/**
 * Custom hook for profile modal state and operations
 * Manages profile editing, password changes, and passkey operations
 * @module hooks/useProfileModal
 */

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { addPasskey, passkey } from '../lib/auth';
import { useNotifications } from './useNotifications.jsx';
import { useFormSync } from './useFormSync';
import { useAsyncOperation } from './async';
import { useStandardForm } from './forms/useStandardForm';
import logger from '../utils/logger';
import { validatePassword } from '../utils/userValidation';

/**
 * Hook for managing profile modal state
 * @param {Object} params - Hook parameters
 * @param {Function} params.closeModal - Function to close the modal
 * @returns {Object} State and handlers for profile modal
 */
export function useProfileModal({ closeModal }) {
  const { user, changeProfilePassword, updateProfile } = useAuth();
  const notify = useNotifications();

  // Tab state
  const [activeTab, setActiveTab] = useState('profile');

  // Success state (still need these for UI feedback)
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Passkey state
  const [passkeys, setPasskeys] = useState([]);
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(true);

  // Async operations
  const passwordOperation = useAsyncOperation({
    onError: (error) => logger.error('Password change error:', error),
  });

  const profileOperation = useAsyncOperation({
    onError: (error) => logger.error('Profile update error:', error),
  });

  const loadPasskeysOperation = useAsyncOperation({
    onError: (error) => logger.error('Error loading passkeys:', error),
  });

  const registerPasskeyOperation = useAsyncOperation({
    onError: (error) => logger.error('Passkey registration error:', error),
  });

  const deletePasskeyOperation = useAsyncOperation({
    onError: (error) => logger.error('Error deleting passkey:', error),
  });

  // Derived states for backward compatibility
  const passwordLoading = passwordOperation.loading;
  const passwordError = passwordOperation.error;
  const profileLoading = profileOperation.loading;
  const profileError = profileOperation.error;
  const passkeysLoading = loadPasskeysOperation.loading;
  const passkeysError =
    loadPasskeysOperation.error ||
    registerPasskeyOperation.error ||
    deletePasskeyOperation.error;
  const registeringPasskey = registerPasskeyOperation.loading;

  // Forms using useStandardForm
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

  const passkeyFormState = useStandardForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (!value ? 'Passkey name is required' : null),
    },
    resetOnSuccess: false, // Manual reset in handler
  });

  const profileFormState = useStandardForm({
    initialValues: {
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
    },
    validate: {
      name: (value) => (!value ? 'Name is required' : null),
      email: (value) => {
        if (!value) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return !emailRegex.test(value) ? 'Invalid email format' : null;
      },
      username: (value) =>
        !value
          ? 'Username is required'
          : value.length < 3
            ? 'Username must be at least 3 characters'
            : null,
    },
    resetOnSuccess: false, // Manual reset in handler
  });

  // Sync profile form with user data
  useFormSync(
    profileFormState.form,
    {
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
    },
    [user.name, user.email, user.username],
  );

  // Check WebAuthn support
  const checkWebAuthnSupport = useCallback(async () => {
    // WebAuthn support check - Better Auth handles this internally
    setIsWebAuthnSupported(true);
  }, []);

  // Load passkeys from Better Auth
  const loadPasskeys = useCallback(async () => {
    await loadPasskeysOperation.execute(async () => {
      // Use Better Auth passkey client to list user's passkeys
      if (passkey && passkey.listUserPasskeys) {
        const result = await passkey.listUserPasskeys();
        if (result.error) {
          throw new Error(result.error.message);
        }
        setPasskeys(result.data || []);
      } else {
        // Fallback if listing is not available - set empty array
        logger.warn('Passkey listing not available');
        setPasskeys([]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data loading function (called by component on mount)
  const loadData = useCallback(async () => {
    await checkWebAuthnSupport();
    await loadPasskeys();
  }, [checkWebAuthnSupport, loadPasskeys]);

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
          await notify.passwordChange(
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
      notify,
      changeProfilePassword,
      passwordFormState,
      activeTab,
      closeModal,
    ],
  );

  /**
   * Handle profile update submission
   */
  const handleProfileSubmit = useCallback(
    async (values) => {
      setProfileSuccess(false);

      await profileOperation.execute(async () => {
        await notify.profileUpdate(
          updateProfile({
            name: values.name,
            email: values.email,
            username: values.username,
          }),
        );

        setProfileSuccess(true);
        setIsEditingProfile(false);

        // Auto-clear success message
        setTimeout(() => {
          setProfileSuccess(false);
        }, 3000);
      });
    },
    [notify, updateProfile, profileOperation],
  );

  /**
   * Cancel profile editing
   */
  const handleCancelProfileEdit = useCallback(() => {
    setIsEditingProfile(false);
    setProfileSuccess(false);
    profileFormState.form.setValues({
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
    });
  }, [user, profileFormState]);

  /**
   * Register a new passkey
   */
  const handleRegisterPasskey = useCallback(
    async (values) => {
      await registerPasskeyOperation.execute(async () => {
        // Use Better Auth addPasskey function
        const result = await addPasskey({
          name: values.name,
        });

        // Better Auth may return result directly or in a result object
        if (result && result.error) {
          throw new Error(result.error.message || 'Failed to register passkey');
        }

        notify.success('Passkey registered successfully!');

        // Reload passkeys list
        await loadPasskeys();
        passkeyFormState.form.reset();
      });

      // Show error notification if operation failed
      if (registerPasskeyOperation.error) {
        notify.error(
          'Failed to register passkey: ' +
            (registerPasskeyOperation.error || 'Unknown error'),
        );
      }
    },
    [loadPasskeys, passkeyFormState, notify, registerPasskeyOperation],
  );

  /**
   * Delete a passkey
   */
  const handleDeletePasskey = useCallback(
    async (credentialId) => {
      await deletePasskeyOperation.execute(async () => {
        // Use Better Auth passkey deletion
        if (passkey && passkey.deletePasskey) {
          const result = await passkey.deletePasskey({
            id: credentialId,
          });

          if (result.error) {
            throw new Error(result.error.message);
          }

          notify.success('Passkey deleted successfully!');

          // Reload passkeys list
          await loadPasskeys();
        } else {
          throw new Error('Passkey deletion not available');
        }
      });

      // Show error notification if operation failed
      if (deletePasskeyOperation.error) {
        notify.error(
          'Failed to delete passkey: ' + deletePasskeyOperation.error,
        );
      }
    },
    [loadPasskeys, notify, deletePasskeyOperation],
  );

  /**
   * Handle modal close with cleanup
   */
  const handleClose = useCallback(() => {
    passwordFormState.form.reset();
    passkeyFormState.form.reset();
    setPasswordSuccess(false);
    setActiveTab('profile');
    closeModal();
  }, [passwordFormState, passkeyFormState, closeModal]);

  return {
    // Tab state
    activeTab,
    setActiveTab,

    // User data
    user,

    // Password state
    passwordLoading,
    passwordError,
    passwordSuccess,
    passwordFormState,
    handlePasswordSubmit,

    // Profile state
    profileLoading,
    profileError,
    profileSuccess,
    isEditingProfile,
    setIsEditingProfile,
    profileFormState,
    handleProfileSubmit,
    handleCancelProfileEdit,

    // Passkey state
    passkeys,
    passkeysLoading,
    passkeysError,
    registeringPasskey,
    isWebAuthnSupported,
    passkeyFormState,
    handleRegisterPasskey,
    handleDeletePasskey,

    // Modal control
    handleClose,
    loadData,
  };
}
