/**
 * Hook for managing passkeys (WebAuthn)
 * Handles passkey listing, registration, and deletion
 * @module hooks/usePasskeyManagement
 */

import { useState, useCallback } from 'react';
import { addPasskey, passkey } from '../lib/auth';
import { notificationAPI } from '../utils/notificationAPI.jsx';
import { useAsyncOperation } from './async';
import { useStandardForm } from './forms/useStandardForm';
import logger from '../utils/logger';

/**
 * Hook for passkey management operations
 * @returns {Object} State and handlers for passkey management
 */
export function usePasskeyManagement() {
  // State
  const [passkeys, setPasskeys] = useState([]);
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(true);

  // Async operations
  const loadPasskeysOperation = useAsyncOperation({
    onError: (error) => logger.error('Error loading passkeys:', error),
  });

  const registerPasskeyOperation = useAsyncOperation({
    onError: (error) => logger.error('Passkey registration error:', error),
  });

  const deletePasskeyOperation = useAsyncOperation({
    onError: (error) => logger.error('Error deleting passkey:', error),
  });

  // Form state using useStandardForm
  const passkeyFormState = useStandardForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (!value ? 'Passkey name is required' : null),
    },
    resetOnSuccess: false, // Manual reset in handler
  });

  // Derived states
  const passkeysLoading = loadPasskeysOperation.loading;
  const passkeysError =
    loadPasskeysOperation.error ||
    registerPasskeyOperation.error ||
    deletePasskeyOperation.error;
  const registeringPasskey = registerPasskeyOperation.loading;

  /**
   * Check WebAuthn support
   */
  const checkWebAuthnSupport = useCallback(async () => {
    // WebAuthn support check - Better Auth handles this internally
    setIsWebAuthnSupported(true);
  }, []);

  /**
   * Load passkeys from Better Auth
   */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
  }, [loadPasskeysOperation.execute]);

  /**
   * Data loading function (loads WebAuthn support and passkeys)
   */
  const loadData = useCallback(async () => {
    await checkWebAuthnSupport();
    await loadPasskeys();
  }, [checkWebAuthnSupport, loadPasskeys]);

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

        notificationAPI.success('Passkey registered successfully!');

        // Reload passkeys list
        await loadPasskeys();
        passkeyFormState.form.reset();
      });

      // Show error notification if operation failed
      if (registerPasskeyOperation.error) {
        notificationAPI.error(
          'Failed to register passkey: ' +
            (registerPasskeyOperation.error || 'Unknown error'),
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute/.error for stable reference
    [
      loadPasskeys,
      passkeyFormState,
      registerPasskeyOperation.execute,
      registerPasskeyOperation.error,
    ],
  );

  /**
   * Delete a passkey
   */
  const handleDeletePasskey = useCallback(
    async (credentialId) => {
      const result = await deletePasskeyOperation.execute(async () => {
        // Use Better Auth passkey deletion
        if (passkey && passkey.deletePasskey) {
          const deleteResult = await passkey.deletePasskey({
            id: credentialId,
          });

          if (deleteResult.error) {
            throw new Error(deleteResult.error.message);
          }

          return true; // Return success indicator
        } else {
          throw new Error('Passkey deletion not available');
        }
      });

      // Only reload and show success if deletion succeeded
      if (result) {
        notificationAPI.success('Passkey deleted successfully!');
        // Reload passkeys list after successful deletion
        await loadPasskeys();
      } else if (deletePasskeyOperation.error) {
        notificationAPI.error(
          'Failed to delete passkey: ' + deletePasskeyOperation.error,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute/.error for stable reference
    [
      loadPasskeys,
      deletePasskeyOperation.execute,
      deletePasskeyOperation.error,
    ],
  );

  return {
    // State
    passkeys,
    passkeysLoading,
    passkeysError,
    registeringPasskey,
    isWebAuthnSupported,
    passkeyFormState,
    // Handlers
    loadData,
    handleRegisterPasskey,
    handleDeletePasskey,
    resetPasskeyForm: passkeyFormState.form.reset,
  };
}
