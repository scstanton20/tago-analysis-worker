import { useCallback } from 'react';
import { modals } from '@mantine/modals';
import { useUserCRUD } from './useUserCRUD';
import { useUserActions } from './useUserActions';

/**
 * Orchestrator hook that composes user CRUD and admin actions
 * Provides a unified interface for all user management operations
 * Maintains backward compatibility with existing components
 */
export function useUserOperations({
  organizationId,
  currentUser,
  refreshUserData,
  refetchSession,
  editingUser,
  setEditingUser,
  setShowCreateForm,
  setCreatedUserInfo,
  form,
}) {
  // Compose CRUD hook
  const crud = useUserCRUD({
    organizationId,
    currentUser,
    refreshUserData,
    editingUser,
    setEditingUser,
    setShowCreateForm,
    setCreatedUserInfo,
    form,
  });

  // Compose actions hook (needs loadUsers from CRUD)
  const actions = useUserActions({
    refetchSession,
    loadUsers: crud.loadUsers,
  });

  // Wrap delete handler with confirmation modal
  const handleDelete = useCallback(
    (user) => {
      modals.openConfirmModal({
        title: 'Delete User',
        children: `Are you sure you want to delete user "${user.name || user.email}"?`,
        labels: { confirm: 'Delete', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: () => crud.handleDelete(user),
      });
    },
    [crud],
  );

  // Wrap impersonate handler with confirmation modal
  const handleImpersonate = useCallback(
    (user) => {
      modals.openConfirmModal({
        title: 'Impersonate User',
        children: `Are you sure you want to impersonate "${user.name || user.email}"? You will be logged in as this user.`,
        labels: { confirm: 'Impersonate', cancel: 'Cancel' },
        confirmProps: { color: 'blue' },
        onConfirm: () => actions.handleImpersonate(user),
      });
    },
    [actions],
  );

  // Wrap ban handler with confirmation modal
  const handleBanUser = useCallback(
    (user) => {
      modals.openConfirmModal({
        title: 'Ban User',
        children: `Are you sure you want to ban "${user.name || user.email}"? This will immediately log them out and prevent them from signing in.`,
        labels: { confirm: 'Ban User', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: () => actions.handleBanUser(user),
      });
    },
    [actions],
  );

  // Wrap unban handler with confirmation modal (no confirmation needed for unban)
  const handleUnbanUser = useCallback(
    (user) => {
      actions.handleUnbanUser(user);
    },
    [actions],
  );

  // Combine loading states
  const loading = crud.loading || actions.loading;

  // Combine error states
  const error = crud.error || actions.error;

  return {
    // State (from CRUD)
    users: crud.users,
    loading,
    error,
    actions: crud.actions,
    // CRUD Operations
    loadUsers: crud.loadUsers,
    loadActions: crud.loadActions,
    handleSubmit: crud.handleSubmit,
    handleEdit: crud.handleEdit,
    handleDelete,
    // Admin Actions
    handleImpersonate,
    handleManageSessions: actions.handleManageSessions,
    handleBanUser,
    handleUnbanUser,
  };
}
