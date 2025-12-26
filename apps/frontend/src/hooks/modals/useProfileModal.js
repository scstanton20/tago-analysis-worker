/**
 * Orchestrator hook for profile modal state and operations
 * Composes password management, profile editing, and passkey management
 * Maintains backward compatibility with existing components
 * @module hooks/useProfileModal
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../useAuth';
import { usePasswordManagement } from '../usePasswordManagement';
import { useProfileEditing } from '../useProfileEditing';
import { usePasskeyManagement } from '../usePasskeyManagement';

/**
 * Orchestrator hook for managing profile modal
 * @param {Object} params - Hook parameters
 * @param {Function} params.closeModal - Function to close the modal
 * @returns {Object} Combined state and handlers from all profile hooks
 */
export function useProfileModal({ closeModal }) {
  const { user } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState('profile');

  // Compose password management hook
  const password = usePasswordManagement({
    activeTab,
    closeModal,
  });

  // Compose profile editing hook
  const profile = useProfileEditing();

  // Compose passkey management hook
  const passkeys = usePasskeyManagement();

  /**
   * Handle modal close with cleanup
   */
  const handleClose = useCallback(() => {
    password.resetPasswordForm();
    passkeys.resetPasskeyForm();
    password.clearPasswordSuccess();
    setActiveTab('profile');
    closeModal();
  }, [password, passkeys, closeModal]);

  // Compute if any form has unsaved changes
  const hasUnsavedChanges =
    (profile.isEditingProfile && profile.profileFormState.isDirty) ||
    password.passwordFormState.isDirty ||
    passkeys.passkeyFormState.isDirty;

  return {
    // Tab state
    activeTab,
    setActiveTab,

    // User data
    user,

    // Password management (from usePasswordManagement)
    passwordLoading: password.passwordLoading,
    passwordError: password.passwordError,
    passwordSuccess: password.passwordSuccess,
    passwordFormState: password.passwordFormState,
    handlePasswordSubmit: password.handlePasswordSubmit,

    // Profile editing (from useProfileEditing)
    profileLoading: profile.profileLoading,
    profileError: profile.profileError,
    profileSuccess: profile.profileSuccess,
    isEditingProfile: profile.isEditingProfile,
    setIsEditingProfile: profile.setIsEditingProfile,
    profileFormState: profile.profileFormState,
    handleProfileSubmit: profile.handleProfileSubmit,
    handleCancelProfileEdit: profile.handleCancelProfileEdit,

    // Passkey management (from usePasskeyManagement)
    passkeys: passkeys.passkeys,
    passkeysLoading: passkeys.passkeysLoading,
    passkeysError: passkeys.passkeysError,
    registeringPasskey: passkeys.registeringPasskey,
    isWebAuthnSupported: passkeys.isWebAuthnSupported,
    passkeyFormState: passkeys.passkeyFormState,
    handleRegisterPasskey: passkeys.handleRegisterPasskey,
    handleDeletePasskey: passkeys.handleDeletePasskey,

    // Unsaved changes tracking
    hasUnsavedChanges,

    // Modal control
    handleClose,
    loadData: passkeys.loadData,
  };
}
