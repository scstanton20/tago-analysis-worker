import { useState, useMemo, useEffect, useCallback } from 'react';
import { authClient } from '../../lib/auth';
import logger from '../../utils/logger.js';
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
 */
export function useUserManagement({
  currentUser,
  organizationId,
  refreshUserData,
  refetchSession,
  teams,
}) {
  // Convert teams from SSE object to array format for dropdown
  const availableTeams = useMemo(() => transformTeamsToOptions(teams), [teams]);

  // Fetch current user's member role on mount
  const [currentUserMemberRole, setCurrentUserMemberRole] = useState(null);
  const [memberRoleError, setMemberRoleError] = useState(null);

  useEffect(() => {
    const fetchMemberRole = async () => {
      try {
        const { data, error } =
          await authClient.organization.getActiveMemberRole();
        if (error) {
          setMemberRoleError(error.message);
          logger.error('Error fetching member role:', error);
          return;
        }
        if (data?.role) {
          setCurrentUserMemberRole(data.role);
          setMemberRoleError(null);
        }
      } catch (err) {
        logger.error('Error fetching member role:', err);
        setMemberRoleError(err.message);
      }
    };

    fetchMemberRole();
  }, []);

  // Initialize form management hook
  const {
    editingUser,
    setEditingUser,
    showCreateForm,
    setShowCreateForm,
    createdUserInfo,
    setCreatedUserInfo,
    isRootUser,
    form,
    formState,
    handleCancel,
    handleCreate,
  } = useUserForm({
    currentUser,
    currentUserMemberRole,
  });

  // Initialize operations hook (includes users state)
  // Note: This must be initialized first to get users list
  const operations = useUserOperations({
    organizationId,
    currentUser,
    refreshUserData,
    refetchSession,
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

  // Combine all errors
  const combinedError = error || memberRoleError;

  return {
    // State
    users,
    loading,
    editingUser,
    showCreateForm,
    error: combinedError,
    createdUserInfo,
    setCreatedUserInfo,
    availableTeams,
    actions,
    form,
    formState,
    isRootUser,
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
