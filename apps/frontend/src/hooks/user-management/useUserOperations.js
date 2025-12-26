import { useCallback } from 'react';
import { ConfirmDialog } from '../../components/global';
import { useUserCRUD } from './useUserCRUD';
import { useUserActions } from './useUserActions';

/**
 * Orchestrator hook that composes user CRUD and admin actions
 * Provides a unified interface for all user management operations
 * Maintains backward compatibility with existing components
 */
export function useUserOperations({
  editingUser,
  setEditingUser,
  setShowCreateForm,
  setCreatedUserInfo,
  form,
}) {
  // Compose CRUD hook (currentUser, organizationId, refreshUserData come from contexts internally)
  const crud = useUserCRUD({
    editingUser,
    setEditingUser,
    setShowCreateForm,
    setCreatedUserInfo,
    form,
  });

  // Compose actions hook (refetchSession comes from useAuth internally)
  const actions = useUserActions({
    loadUsers: crud.loadUsers,
  });

  // Wrap delete handler with confirmation modal
  const handleDelete = useCallback(
    (user) => {
      ConfirmDialog.delete({
        title: 'Delete User',
        itemName: user.name || user.email,
        onConfirm: () => crud.handleDelete(user),
      });
    },
    [crud],
  );

  // Wrap impersonate handler with confirmation modal
  const handleImpersonate = useCallback(
    (user) => {
      ConfirmDialog.info({
        title: 'Impersonate User',
        message: `Are you sure you want to impersonate "${user.name || user.email}"? You will be logged in as this user.`,
        confirmLabel: 'Impersonate',
        onConfirm: () => actions.handleImpersonate(user),
      });
    },
    [actions],
  );

  // Wrap ban handler with confirmation modal
  const handleBanUser = useCallback(
    (user) => {
      ConfirmDialog.destructive({
        title: 'Ban User',
        message: `Are you sure you want to ban "${user.name || user.email}"? This will immediately log them out and prevent them from signing in.`,
        confirmLabel: 'Ban User',
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
