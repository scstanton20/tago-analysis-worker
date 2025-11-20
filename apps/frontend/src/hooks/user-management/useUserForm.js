import { useState, useCallback, useMemo } from 'react';
import { useStandardForm } from '../forms/useStandardForm';
import { getFormValidationRules } from './utils/validation';

/**
 * Hook for managing user form state and UI
 */
export function useUserForm({ currentUser, currentUserMemberRole }) {
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

  // Check if the current user is the root user editing their own account
  // Root users (member role 'owner') cannot change their own role
  const isRootUser = useMemo(
    () =>
      currentUserMemberRole === 'owner' && editingUser?.id === currentUser?.id,
    [currentUserMemberRole, editingUser, currentUser],
  );

  /**
   * Cancel form and reset state
   */
  const handleCancel = useCallback(() => {
    setEditingUser(null);
    setShowCreateForm(false);
    setCreatedUserInfo(null);
    form.reset();
    form.clearFieldError('username');
    form.clearFieldError('email');
  }, [form]);

  /**
   * Show create form with empty values
   */
  const handleCreate = useCallback(() => {
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
  }, [form]);

  return {
    // State
    editingUser,
    setEditingUser,
    showCreateForm,
    setShowCreateForm,
    createdUserInfo,
    setCreatedUserInfo,
    isRootUser,
    // Form
    form,
    formState,
    // Handlers
    handleCancel,
    handleCreate,
  };
}
