import { useState } from 'react';
import { useStandardForm } from '@/hooks/forms/useStandardForm';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getFormValidationRules } from './utils/validation';

/**
 * Hook for managing user form state and UI
 * @param {Object} params - Hook parameters
 * @param {boolean} params.isOwner - Whether current user is the organization owner
 */
export function useUserForm({ isOwner }) {
  // Get current user from AuthContext
  const { user: currentUser } = useAuth();
  // State management
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createdUserInfo, setCreatedUserInfo] = useState(null);

  // Form setup using useStandardForm
  // Note: Validation functions should not depend on external state like editingUser
  // to ensure they work correctly across form states. Additional validation is done in handleSubmit.
  const formState = useStandardForm({
    initialValues: {
      name: '',
      email: '',
      username: '',
      role: 'user',
      departmentPermissions: {},
    },
    validate: getFormValidationRules(),
    resetOnSuccess: false, // Manual reset in handlers
  });

  const { form } = formState;

  // Check if the owner is editing their own account
  // Owners cannot change their own role
  const isOwnerEditingSelf = isOwner && editingUser?.id === currentUser?.id;

  /**
   * Cancel form and reset state
   */
  const handleCancel = () => {
    setEditingUser(null);
    setShowCreateForm(false);
    setCreatedUserInfo(null);
    form.reset();
    form.clearFieldError('username');
    form.clearFieldError('email');
  };

  /**
   * Show create form with empty values
   */
  const handleCreate = () => {
    setEditingUser(null);
    form.setValues({
      name: '',
      email: '',
      username: '',
      role: 'user',
      departmentPermissions: {},
    });
    form.resetDirty();
    setShowCreateForm(true);
    form.clearFieldError('username');
    form.clearFieldError('email');
  };

  return {
    // State
    editingUser,
    setEditingUser,
    showCreateForm,
    setShowCreateForm,
    createdUserInfo,
    setCreatedUserInfo,
    isOwnerEditingSelf,
    // Form
    form,
    formState,
    // Handlers
    handleCancel,
    handleCreate,
  };
}
