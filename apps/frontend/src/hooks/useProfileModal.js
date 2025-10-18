/**
 * Custom hook for profile modal state and operations
 * Manages profile editing, password changes, and passkey operations
 * @module hooks/useProfileModal
 */

import { useState, useCallback } from 'react';
import { useForm } from '@mantine/form';
import { useAuth } from './useAuth';
import { addPasskey, passkey } from '../lib/auth';
import { useNotifications } from './useNotifications.jsx';
import { useFormSync } from './useFormSync';
import { useModalDataLoader } from './useModalDataLoader';
import logger from '../utils/logger';
import { validatePassword } from '../utils/userValidation';

/**
 * Hook for managing profile modal state
 * @param {Object} params - Hook parameters
 * @param {boolean} params.opened - Whether the modal is open
 * @param {Function} params.onClose - Callback to close the modal
 * @returns {Object} State and handlers for profile modal
 */
export function useProfileModal({ opened, onClose }) {
  const { user, changeProfilePassword, updateProfile } = useAuth();
  const notify = useNotifications();

  // Tab state
  const [activeTab, setActiveTab] = useState('profile');

  // Password change state
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Profile editing state
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Passkey state
  const [passkeys, setPasskeys] = useState([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeysError, setPasskeysError] = useState('');
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(true);

  // Forms
  const passwordForm = useForm({
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
      confirmPassword: (value, values) =>
        value !== values.newPassword ? 'Passwords do not match' : null,
    },
  });

  const passkeyForm = useForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (!value ? 'Passkey name is required' : null),
    },
  });

  const profileForm = useForm({
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
  });

  // Sync profile form with user data
  useFormSync(
    profileForm,
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
    try {
      setPasskeysLoading(true);
      setPasskeysError('');

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
    } catch (error) {
      logger.error('Error loading passkeys:', error);
      setPasskeysError(error.message || 'Failed to load passkeys');
      setPasskeys([]);
    } finally {
      setPasskeysLoading(false);
    }
  }, []);

  // Load WebAuthn support and passkeys when modal opens
  useModalDataLoader(opened, [checkWebAuthnSupport, loadPasskeys]);

  /**
   * Handle password change submission
   */
  const handlePasswordSubmit = useCallback(
    async (values) => {
      try {
        setPasswordLoading(true);
        setPasswordError('');
        setPasswordSuccess(false);

        await notify.passwordChange(
          changeProfilePassword(values.currentPassword, values.newPassword),
        );

        setPasswordSuccess(true);
        passwordForm.reset();

        // Auto-close after success
        setTimeout(() => {
          setPasswordSuccess(false);
          if (activeTab === 'password') {
            onClose();
          }
        }, 2000);
      } catch (err) {
        setPasswordError(err.message || 'Failed to change password');
      } finally {
        setPasswordLoading(false);
      }
    },
    [notify, changeProfilePassword, passwordForm, activeTab, onClose],
  );

  /**
   * Handle profile update submission
   */
  const handleProfileSubmit = useCallback(
    async (values) => {
      try {
        setProfileLoading(true);
        setProfileError('');
        setProfileSuccess(false);

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
      } catch (err) {
        setProfileError(err.message || 'Failed to update profile');
      } finally {
        setProfileLoading(false);
      }
    },
    [notify, updateProfile],
  );

  /**
   * Cancel profile editing
   */
  const handleCancelProfileEdit = useCallback(() => {
    setIsEditingProfile(false);
    setProfileError('');
    setProfileSuccess(false);
    profileForm.setValues({
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
    });
  }, [user, profileForm]);

  /**
   * Register a new passkey
   */
  const handleRegisterPasskey = useCallback(
    async (values) => {
      try {
        setRegisteringPasskey(true);
        setPasskeysError('');

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
        passkeyForm.reset();
      } catch (error) {
        logger.error('Passkey registration error:', error);
        setPasskeysError(error.message || 'Failed to register passkey');
        notify.error(
          'Failed to register passkey: ' + (error.message || 'Unknown error'),
        );
      } finally {
        setRegisteringPasskey(false);
      }
    },
    [loadPasskeys, passkeyForm, notify],
  );

  /**
   * Delete a passkey
   */
  const handleDeletePasskey = useCallback(
    async (credentialId) => {
      try {
        setPasskeysError('');

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
      } catch (error) {
        logger.error('Error deleting passkey:', error);
        setPasskeysError(error.message || 'Failed to delete passkey');
        notify.error('Failed to delete passkey: ' + error.message);
      }
    },
    [loadPasskeys, notify],
  );

  /**
   * Handle modal close with cleanup
   */
  const handleClose = useCallback(() => {
    passwordForm.reset();
    passkeyForm.reset();
    setPasswordError('');
    setPasswordSuccess(false);
    setPasskeysError('');
    setActiveTab('profile');
    onClose();
  }, [passwordForm, passkeyForm, onClose]);

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
    passwordForm,
    handlePasswordSubmit,

    // Profile state
    profileLoading,
    profileError,
    profileSuccess,
    isEditingProfile,
    setIsEditingProfile,
    profileForm,
    handleProfileSubmit,
    handleCancelProfileEdit,

    // Passkey state
    passkeys,
    passkeysLoading,
    passkeysError,
    registeringPasskey,
    isWebAuthnSupported,
    passkeyForm,
    handleRegisterPasskey,
    handleDeletePasskey,

    // Modal control
    handleClose,
  };
}
