import { useState, useCallback, useOptimistic } from 'react';
import { admin, authClient } from '@/features/auth/lib/auth';
import { modalService } from '@/modals/modalService';
import { useAsyncOperation } from '@/hooks/async';
import { useEventListener } from '@/hooks/useEventListener';
import { usePermissions } from '@/features/auth/hooks/usePermissions';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { notificationAPI } from '@/utils/notificationService.jsx';
import logger from '@/utils/logger.js';
import { generateSecurePassword } from '@/validation';
import { userService } from '../api/userService';
import { validateDepartmentPermissions } from './utils/validation';
import {
  transformDepartmentPermissionsToTeamAssignments,
  transformTeamAssignmentsToDepartmentPermissions,
} from './utils/transformers';

/**
 * Hook for managing user CRUD (Create, Read, Update, Delete) operations
 * Handles user data loading, form submission, editing, and deletion
 */
export function useUserCRUD({
  editingUser,
  setEditingUser,
  setShowCreateForm,
  setCreatedUserInfo,
  form,
}) {
  // Get current user from AuthContext
  const { user: currentUser } = useAuth();

  // Get organization data from centralized permissions context
  const { organizationId, refreshUserData } = usePermissions();

  // State management
  const [users, setUsers] = useState([]);
  const [actions, setActions] = useState([]);

  // Optimistic updates for user role changes
  const [optimisticUsers, addOptimisticUpdate] = useOptimistic(
    users,
    (state, updatedUser) => {
      return state.map((user) =>
        user.id === updatedUser.id ? { ...user, ...updatedUser } : user,
      );
    },
  );

  // Async operations
  const loadUsersOperation = useAsyncOperation();
  const loadActionsOperation = useAsyncOperation();
  const submitOperation = useAsyncOperation();
  const deleteOperation = useAsyncOperation();

  // Derived states
  const loading =
    loadUsersOperation.loading ||
    loadActionsOperation.loading ||
    submitOperation.loading ||
    deleteOperation.loading;

  const error =
    loadUsersOperation.error ||
    loadActionsOperation.error ||
    submitOperation.error ||
    deleteOperation.error;

  /**
   * Load all users from the organization
   */
  const loadUsers = useCallback(async () => {
    await loadUsersOperation.execute(async () => {
      // Fetch users and org members in parallel
      const [usersResult, membersResult] = await Promise.all([
        admin.listUsers({ query: { limit: 100 } }),
        organizationId
          ? authClient.organization.listMembers({
              query: { organizationId, limit: 100 },
            })
          : Promise.resolve({ data: { members: [] } }),
      ]);

      if (usersResult.error) {
        throw new Error(usersResult.error.message);
      }

      const usersList = usersResult.data.users || usersResult.data || [];

      // Build a map of userId -> memberRole from org members
      const memberRoles = new Map();
      if (!membersResult.error && membersResult.data?.members) {
        for (const member of membersResult.data.members) {
          memberRoles.set(member.userId, member.role);
        }
      }

      // Combine users with their membership roles
      const usersWithRoles = usersList.map((user) => ({
        ...user,
        memberRole: memberRoles.get(user.id) || null,
      }));

      setUsers(usersWithRoles);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
  }, [loadUsersOperation.execute, organizationId]);

  /**
   * Load available permissions/actions
   */
  const loadActions = useCallback(async () => {
    await loadActionsOperation.execute(async () => {
      const result = await userService.getAvailablePermissions();

      if (result.success && result.data) {
        setActions(result.data);
      } else {
        logger.error('Failed to load permissions:', result.error);
        setActions([]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
  }, [loadActionsOperation.execute]);

  /**
   * Handle form submission for creating or updating a user
   * @param {Object} values - Form values
   * @param {Object} validation - Validation functions and data
   * @param {Function} validation.validateEmail - Email validation function
   * @param {Function} validation.validateUsername - Username validation function
   * @param {Object} validation.existingUserData - Existing user data for duplicate checks
   */
  const handleSubmit = useCallback(
    async (values, validation = {}) => {
      const {
        validateEmail,
        validateUsername,
        existingUserData = { emails: [] },
      } = validation;
      // Prevent users from changing their own role or team permissions
      if (editingUser?.id === currentUser?.id) {
        if (editingUser.role !== values.role) {
          submitOperation.setError('You cannot change your own role');
          return;
        }
        // Prevent changing own team permissions if demoting from admin to user
        if (values.role === 'user' && editingUser.role === 'admin') {
          submitOperation.setError(
            'You cannot assign team permissions to yourself',
          );
          return;
        }
      }

      // Validate email uniqueness (not in form validation to avoid stale closures)
      if (
        !editingUser &&
        values.email &&
        existingUserData.emails.includes(values.email.toLowerCase())
      ) {
        form.setFieldError('email', 'This email address is already registered');
        return;
      }

      // Validate email format (if validation function provided)
      if (validateEmail) {
        const emailError = validateEmail(values.email);
        if (emailError) {
          form.setFieldError('email', emailError);
          return;
        }
      }

      // Validate username (if validation function provided)
      if (values.username && validateUsername) {
        const usernameError = await validateUsername(values.username);
        if (usernameError) {
          form.setFieldError('username', usernameError);
          return;
        }
      }

      // Validate department permissions for new users with 'user' role
      const deptPermError = validateDepartmentPermissions(
        values.role,
        values.departmentPermissions,
        !!editingUser,
      );
      if (deptPermError) {
        form.setFieldError('departmentPermissions', deptPermError);
        return;
      }

      await submitOperation.execute(async () => {
        if (editingUser) {
          // Handle user editing
          const updates = {};
          let needsUpdate = false;

          // Check if role changed
          if (values.role !== editingUser.role) {
            // Optimistically update the role before API call
            addOptimisticUpdate({ id: editingUser.id, role: values.role });

            const roleResult = await admin.setRole({
              userId: editingUser.id,
              role: values.role,
            });
            if (roleResult.error) {
              throw new Error(
                `Failed to update role: ${roleResult.error.message}`,
              );
              // useOptimistic automatically rolls back on error
            }

            logger.log(
              `Role change from ${editingUser.role} to ${values.role}`,
            );

            // Update actual state after successful API call
            setUsers((prevUsers) =>
              prevUsers.map((user) =>
                user.id === editingUser.id
                  ? { ...user, role: values.role }
                  : user,
              ),
            );

            setEditingUser((prev) => ({
              ...prev,
              role: values.role,
            }));

            if (values.role === 'admin' && editingUser.role !== 'admin') {
              try {
                logger.log('Clearing team assignments for new admin...');
                await userService.updateUserTeamAssignments(editingUser.id, []);
                logger.log('✓ Team assignments cleared for new admin');
              } catch (teamError) {
                logger.warn('Error clearing team assignments:', teamError);
              }
            }

            updates.role = values.role;
            needsUpdate = true;
          }

          // Update team assignments for non-admin users
          if (
            values.role !== 'admin' &&
            editingUser.id &&
            values.departmentPermissions
          ) {
            try {
              const teamAssignments =
                transformDepartmentPermissionsToTeamAssignments(
                  values.departmentPermissions,
                );

              logger.log(
                `Updating team assignments for user ${editingUser.id}...`,
              );

              try {
                await userService.updateUserTeamAssignments(
                  editingUser.id,
                  teamAssignments,
                );
                logger.log('✓ Team assignments updated successfully');

                const assignedTeams = teamAssignments.length;
                const message =
                  assignedTeams > 0
                    ? `User permissions updated successfully for ${assignedTeams} team${assignedTeams !== 1 ? 's' : ''}.`
                    : 'User access to all teams has been removed.';

                if (assignedTeams > 0) {
                  notificationAPI.success(message, 'Permissions Updated');
                } else {
                  notificationAPI.warning(message, 'Permissions Updated');
                }

                // Reset form dirty state after successful team assignment update
                form.resetDirty();
              } catch (teamError) {
                logger.warn('Failed to update team assignments:', teamError);
              }
            } catch (teamError) {
              logger.warn('Error updating team assignments:', teamError);
            }
          }

          if (needsUpdate) {
            notificationAPI.success(
              `User ${values.name} updated successfully.`,
            );

            // Reset form dirty state to current values so user can make new changes
            form.resetDirty();

            if (editingUser.id === currentUser?.id) {
              logger.log('Refreshing current user data after update');
              await refreshUserData();
            }
          }
        } else {
          // Create new user
          const autoPassword = generateSecurePassword();

          logger.log('Creating user with values:', {
            name: values.name,
            email: values.email,
            username: values.username,
            role: values.role,
          });

          const createUserData = {
            name: values.name,
            email: values.email,
            password: autoPassword,
            role: values.role,
          };

          if (values.username && values.username.trim()) {
            createUserData.data = {
              username: values.username.trim(),
              displayUsername: values.username.trim(),
            };
          }

          logger.log('Creating user with data:', createUserData);
          const result = await admin.createUser(createUserData);
          logger.log('Create user result:', result);

          if (result.error) {
            let errorMessage = result.error.message;

            if (
              errorMessage.includes('email') &&
              errorMessage.includes('exists')
            ) {
              errorMessage = `Email address "${values.email}" is already registered. Please use a different email.`;
            } else if (
              errorMessage.includes('username') &&
              errorMessage.includes('exists')
            ) {
              errorMessage = `Username "${values.username}" is already taken. Please choose a different username.`;
            } else if (errorMessage.includes('UNIQUE constraint failed')) {
              if (errorMessage.includes('email')) {
                errorMessage = `Email address "${values.email}" is already registered. Please use a different email.`;
              } else if (errorMessage.includes('username')) {
                errorMessage = `Username "${values.username}" is already taken. Please choose a different username.`;
              }
            }

            throw new Error(errorMessage);
          }

          // Handle organization membership and team assignments
          if (organizationId && result.data?.user?.id) {
            if (values.role === 'admin') {
              try {
                logger.log('Adding admin user to main organization...');
                const memberResult = await userService.addUserToOrganization(
                  result.data.user.id,
                  organizationId,
                  'admin',
                );

                if (memberResult.error) {
                  logger.warn(
                    'Failed to add admin to organization:',
                    memberResult.error,
                  );
                } else {
                  logger.log('✓ Admin user added to organization successfully');
                }
              } catch (orgError) {
                logger.warn('Error adding admin to organization:', orgError);
              }
            } else {
              const teamAssignments =
                transformDepartmentPermissionsToTeamAssignments(
                  values.departmentPermissions,
                );

              if (teamAssignments.length > 0) {
                try {
                  logger.log('Adding user to organization with teams...');
                  const memberResult = await userService.addUserToOrganization(
                    result.data.user.id,
                    organizationId,
                    'member',
                  );

                  if (memberResult.error) {
                    logger.warn(
                      'Failed to add user to organization:',
                      memberResult.error,
                    );
                  } else {
                    logger.log('✓ User added to organization successfully');
                  }

                  logger.log(
                    `Assigning user to ${teamAssignments.length} teams...`,
                  );
                  await userService.assignUserToTeams(
                    result.data.user.id,
                    teamAssignments,
                  );
                  logger.log('✓ User assigned to teams successfully');
                } catch (error) {
                  logger.warn('Error in team assignment process:', error);
                }
              } else {
                logger.log(
                  'No teams selected for non-admin user - no organization membership needed',
                );
              }
            }
          }

          notificationAPI.success(`User ${values.name} created successfully.`);

          setCreatedUserInfo({
            name: values.name,
            email: values.email,
            tempPassword: autoPassword,
          });

          await loadUsers();
          setShowCreateForm(false);
        }
      });
    },
    [
      addOptimisticUpdate,
      editingUser,
      currentUser,
      organizationId,
      refreshUserData,
      loadUsers,
      form,
      submitOperation,
      setEditingUser,
      setShowCreateForm,
      setCreatedUserInfo,
    ],
  );

  /**
   * Handle editing a user
   */
  const handleEdit = useCallback(
    async (user) => {
      // If user is editing themselves, redirect to profile modal instead
      if (user.id === currentUser?.id) {
        modalService.openProfile();
        return;
      }

      setEditingUser(user);

      const departmentPermissions = {};

      // For non-admin users, load their team assignments
      if (user.role !== 'admin') {
        try {
          const teamData = await userService.getUserTeamsForEdit(user.id);

          if (teamData.success && teamData.data?.teams) {
            const transformed = transformTeamAssignmentsToDepartmentPermissions(
              teamData.data.teams,
            );
            Object.assign(departmentPermissions, transformed);
            logger.log(
              `✓ Loaded ${teamData.data.teams.length} team assignments for user ${user.id}`,
            );
          }
        } catch (error) {
          logger.warn('Error fetching user team memberships:', error);
        }
      }

      form.setValues({
        name: user.name || '',
        email: user.email || '',
        username: user.username || '',
        role: user.role || 'user',
        departmentPermissions,
      });
      form.resetDirty();
      setShowCreateForm(true);
    },
    [form, currentUser, setEditingUser, setShowCreateForm],
  );

  /**
   * Handle deleting a user
   */
  const handleDelete = useCallback(
    async (user, onConfirm) => {
      await deleteOperation.execute(async () => {
        const result = await userService.removeUserFromOrganization(
          user.id,
          organizationId,
        );

        if (result.error) {
          throw new Error(result.error.message);
        }

        notificationAPI.success(
          `User ${user.name || user.email} deleted successfully.`,
        );

        // Note: SSE will automatically update the user list via handleUserDeleted
        // SSE connections are automatically closed by the backend afterRemoveMember hook
      });

      if (onConfirm) {
        onConfirm();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [organizationId, deleteOperation.execute],
  );

  /**
   * SSE event listener for user deletion
   */
  const handleUserDeleted = useCallback((event) => {
    const data = event.detail;
    logger.log('User management: Received user deleted event:', data);

    // Remove the deleted user from the users list
    setUsers((prevUsers) => {
      const filteredUsers = prevUsers.filter((user) => user.id !== data.userId);
      logger.log(
        `Removed user ${data.userId} from list. Remaining users: ${filteredUsers.length}`,
      );
      return filteredUsers;
    });
  }, []);

  useEventListener('userDeleted', handleUserDeleted);

  return {
    // State
    users: optimisticUsers,
    loading,
    error,
    actions,
    // Operations
    loadUsers,
    loadActions,
    // Handlers
    handleSubmit,
    handleEdit,
    handleDelete,
  };
}
