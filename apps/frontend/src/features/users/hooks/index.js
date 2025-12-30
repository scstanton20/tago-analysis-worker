import { useMemo, useCallback } from 'react';
import { usePermissions } from '@/features/auth/hooks/usePermissions';
import { useTeams } from '@/contexts/sseContext/index';
import { useUserForm } from './useUserForm';
import { useUserValidation } from './useUserValidation';
import { useUserOperations } from './useUserOperations';
import {
  transformTeamsToOptions,
  extractExistingUserData,
} from './utils/transformers';

/**
 * Main hook for managing user operations
 * Composes smaller focused hooks for better maintainability
 * Encapsulates all state, handlers, and business logic for user management
 * All context data (currentUser, teams, permissions) accessed internally via hooks
 */
export function useUserManagement() {
  // Get organization data from centralized PermissionsContext
  const { isOwner } = usePermissions();

  // Get teams from SSE context
  const { teams } = useTeams();

  // Convert teams from SSE object to array format for dropdown
  const availableTeams = useMemo(() => transformTeamsToOptions(teams), [teams]);

  // Initialize form management hook
  const {
    editingUser,
    setEditingUser,
    showCreateForm,
    setShowCreateForm,
    createdUserInfo,
    setCreatedUserInfo,
    isOwnerEditingSelf,
    form,
    formState,
    handleCancel,
    handleCreate,
  } = useUserForm({
    isOwner,
  });

  // Initialize operations hook (includes users state)
  // Note: This must be initialized first to get users list
  const operations = useUserOperations({
    editingUser,
    setEditingUser,
    setShowCreateForm,
    setCreatedUserInfo,
    form,
  });

  const {
    users,
    loading,
    error,
    actions,
    loadUsers,
    loadActions,
    handleEdit,
    handleDelete,
    handleImpersonate,
    handleManageSessions,
    handleBanUser,
    handleUnbanUser,
  } = operations;

  // Extract usernames and emails from existing users data
  const existingUserData = useMemo(
    () => extractExistingUserData(users),
    [users],
  );

  // Initialize validation hook (depends on users data)
  const { validateUsername, validateEmail, handleUsernameBlur } =
    useUserValidation({
      editingUser,
      existingUserData,
    });

  // Get handleSubmit from operations with validation functions
  const handleSubmit = useCallback(
    async (values) => {
      return operations.handleSubmit(values, {
        validateEmail,
        validateUsername,
        existingUserData,
      });
    },
    [operations, validateEmail, validateUsername, existingUserData],
  );

  // Note: Department permissions are now handled by DepartmentPermissionsField component
  // The useDepartmentPermissions hook is no longer needed at this level

  return {
    // State
    users,
    loading,
    editingUser,
    showCreateForm,
    error,
    createdUserInfo,
    setCreatedUserInfo,
    availableTeams,
    actions,
    form,
    formState,
    isOwnerEditingSelf,
    // Functions
    loadUsers,
    loadActions,
    // Handlers
    handleSubmit,
    handleEdit,
    handleDelete,
    handleImpersonate,
    handleManageSessions,
    handleBanUser,
    handleUnbanUser,
    handleCancel,
    handleCreate,
    handleUsernameBlur,
  };
}
