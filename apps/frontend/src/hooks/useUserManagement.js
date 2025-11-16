import { useState, useCallback, useMemo, useEffect } from 'react';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { admin, authClient } from '../lib/auth';
import { userService } from '../services/userService';
import { modalService } from '../modals/modalService';
import { useAsyncOperation } from './async';
import { useEventListener } from './useEventListener';
import logger from '../utils/logger.js';
import {
  generateSecurePassword,
  EMAIL_REGEX,
  USERNAME_REGEX,
  MIN_USERNAME_LENGTH,
  validatePassword,
} from '../utils/userValidation';

/**
 * Custom hook for managing user operations
 * Encapsulates all state, handlers, and business logic for user management
 */
export function useUserManagement({
  currentUser,
  organizationId,
  refreshUserData,
  refetchSession,
  notify,
  teams,
}) {
  // State management
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createdUserInfo, setCreatedUserInfo] = useState(null);
  const [actions, setActions] = useState([]);
  const [currentUserMemberRole, setCurrentUserMemberRole] = useState(null);
  const [memberRoleError, setMemberRoleError] = useState(null);

  // Async operations (errors are exposed via .error property and displayed to user)
  const loadUsersOperation = useAsyncOperation();
  const loadActionsOperation = useAsyncOperation();
  const submitOperation = useAsyncOperation();
  const deleteOperation = useAsyncOperation();
  const banOperation = useAsyncOperation();
  const unbanOperation = useAsyncOperation();
  const impersonateOperation = useAsyncOperation();

  // Derived states
  const loading =
    loadUsersOperation.loading ||
    loadActionsOperation.loading ||
    submitOperation.loading ||
    deleteOperation.loading ||
    banOperation.loading ||
    unbanOperation.loading ||
    impersonateOperation.loading;

  const error =
    loadUsersOperation.error ||
    loadActionsOperation.error ||
    submitOperation.error ||
    deleteOperation.error ||
    banOperation.error ||
    unbanOperation.error ||
    impersonateOperation.error ||
    memberRoleError;

  // Convert teams from SSE object to array format for dropdown
  const availableTeams = useMemo(() => {
    if (!teams || typeof teams !== 'object') {
      return [];
    }

    return Object.values(teams)
      .filter((team) => !team.isSystem) // Exclude system teams
      .map((team) => ({
        value: team.id,
        label: team.name,
      }));
  }, [teams]);

  // Extract usernames and emails from existing users data
  const existingUserData = useMemo(() => {
    const usernames = [];
    const emails = [];

    users.forEach((user) => {
      if (user.name) usernames.push(user.name.toLowerCase());
      if (user.email) emails.push(user.email.toLowerCase());
    });

    return {
      usernames: [...new Set(usernames)],
      emails: [...new Set(emails)],
    };
  }, [users]);

  // Form setup
  const form = useForm({
    initialValues: {
      name: '',
      email: '',
      username: '',
      password: '',
      role: 'user',
      departmentPermissions: {},
    },
    validate: {
      name: (value) => (!value?.trim() ? 'Name is required' : null),
      email: (value) => {
        if (!value?.trim()) return 'Email is required';
        if (!EMAIL_REGEX.test(value)) {
          return 'Invalid email format. Must include @ and a valid domain (e.g., user@example.com)';
        }
        // Check uniqueness for new users only
        if (
          !editingUser &&
          existingUserData.emails.includes(value.toLowerCase())
        ) {
          return 'This email address is already registered';
        }
        return null;
      },
      username: (value) => {
        // Username is optional, so allow empty
        if (!value) return null;

        if (value.length < MIN_USERNAME_LENGTH) {
          return `Username must be at least ${MIN_USERNAME_LENGTH} characters`;
        }
        if (!USERNAME_REGEX.test(value)) {
          return 'Username can only contain letters, numbers, hyphens, underscores, and dots';
        }
        // Note: Async availability check is handled separately in handleUsernameChange
        return null;
      },
      role: (value) => (!value ? 'Role is required' : null),
      departmentPermissions: (value, values) => {
        // Only validate team selection for 'user' role during creation
        if (values.role === 'user' && !editingUser) {
          const hasTeams = Object.values(value).some((dept) => dept.enabled);
          if (!hasTeams) {
            return 'At least one team must be selected for users with the User role';
          }
        }
        return null;
      },
    },
  });

  // Load functions
  const loadUsers = useCallback(async () => {
    await loadUsersOperation.execute(async () => {
      const result = await admin.listUsers({
        query: {
          limit: 100,
        },
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      setUsers(result.data.users || result.data || []);
    });
  }, [loadUsersOperation]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch current user's member role on mount
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

  // Check if the current user is the root user editing their own account
  // Root users (member role 'owner') cannot change their own role
  const isRootUser = useMemo(
    () =>
      currentUserMemberRole === 'owner' && editingUser?.id === currentUser?.id,
    [currentUserMemberRole, editingUser, currentUser],
  );

  // Validation functions
  const validateUsername = useCallback(
    async (username) => {
      if (!username) return null;
      if (username.length < MIN_USERNAME_LENGTH)
        return `Username must be at least ${MIN_USERNAME_LENGTH} characters`;
      if (!USERNAME_REGEX.test(username))
        return 'Username can only contain letters, numbers, hyphens, underscores, and dots';

      if (editingUser) return null;

      try {
        const response = await authClient.isUsernameAvailable({ username });
        return response.data?.available
          ? null
          : 'This username is already taken';
      } catch (error) {
        logger.error('Error checking username availability:', error);
        return 'Unable to verify username availability';
      }
    },
    [editingUser],
  );

  const validateEmail = useCallback(
    (email) => {
      if (!email) return 'Email is required';
      if (!EMAIL_REGEX.test(email))
        return 'Invalid email format. Must include @ and a valid domain (e.g., user@example.com)';

      if (
        !editingUser &&
        existingUserData.emails.includes(email.toLowerCase())
      ) {
        return 'This email address is already registered';
      }

      return null;
    },
    [editingUser, existingUserData.emails],
  );

  /**
   * Handle username blur to check async availability
   * Format validation is handled by form's validate object
   */
  const handleUsernameBlur = useCallback(
    async (value) => {
      // Only check availability if format is valid (no format errors from validate object)
      if (!value || form.errors.username) return;

      const error = await validateUsername(value);
      if (error) {
        form.setFieldError('username', error);
      }
    },
    [form, validateUsername],
  );

  // Department permission helpers
  const toggleDepartment = useCallback(
    (departmentId) => {
      const current = form.values.departmentPermissions[departmentId] || {
        enabled: false,
        permissions: [],
      };
      const newEnabled = !current.enabled;

      form.setFieldValue(`departmentPermissions.${departmentId}`, {
        enabled: newEnabled,
        permissions: newEnabled ? ['view_analyses'] : [],
      });
    },
    [form],
  );

  const toggleDepartmentPermission = useCallback(
    (departmentId, permission) => {
      const current = form.values.departmentPermissions[departmentId] || {
        enabled: false,
        permissions: [],
      };
      const currentPermissions = current.permissions || [];

      let newPermissions;
      if (currentPermissions.includes(permission)) {
        newPermissions = currentPermissions.filter((p) => p !== permission);
        if (newPermissions.length === 0) {
          newPermissions = ['view_analyses'];
        }
      } else {
        newPermissions = [...currentPermissions, permission];
      }

      form.setFieldValue(
        `departmentPermissions.${departmentId}.permissions`,
        newPermissions,
      );
    },
    [form],
  );

  // Helper function to check if current user is the only admin
  const isOnlyAdmin = useCallback(() => {
    const adminUsers = users.filter((user) => user.role === 'admin');
    return (
      adminUsers.length === 1 &&
      currentUser?.role === 'admin' &&
      adminUsers[0]?.id === currentUser?.id
    );
  }, [users, currentUser]);

  // Event handlers
  const handleSubmit = useCallback(
    async (values) => {
      // Validate email and username before submission
      const emailError = validateEmail(values.email);
      if (emailError) {
        form.setFieldError('email', emailError);
        return;
      }

      if (values.username) {
        const usernameError = await validateUsername(values.username);
        if (usernameError) {
          form.setFieldError('username', usernameError);
          return;
        }
      }

      await submitOperation.execute(async () => {
        if (editingUser) {
          // Handle user editing
          const updates = {};
          let needsUpdate = false;

          // Check if role changed
          if (values.role !== editingUser.role) {
            const roleResult = await admin.setRole({
              userId: editingUser.id,
              role: values.role,
            });
            if (roleResult.error) {
              throw new Error(
                `Failed to update role: ${roleResult.error.message}`,
              );
            }

            logger.log(
              `Role change from ${editingUser.role} to ${values.role}`,
            );

            // Immediately update the users array (optimistic update)
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

          // Update password if provided
          if (values.password && values.password.trim()) {
            // Validate password before updating
            const passwordError = validatePassword(values.password);
            if (passwordError) {
              form.setFieldError('password', passwordError);
              return;
            }

            const passwordResult = await admin.setUserPassword({
              userId: editingUser.id,
              password: values.password,
            });

            if (passwordResult.error) {
              throw new Error(
                `Failed to update password: ${passwordResult.error.message}`,
              );
            }
            needsUpdate = true;
          }

          // Update team assignments for non-admin users
          if (
            values.role !== 'admin' &&
            editingUser.id &&
            values.departmentPermissions
          ) {
            try {
              const teamAssignments = Object.entries(
                values.departmentPermissions,
              )
                .filter(([, config]) => config.enabled)
                .map(([teamId, config]) => ({
                  teamId,
                  permissions: config.permissions || ['view_analyses'],
                }));

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
                  notify.success(message, 'Permissions Updated');
                } else {
                  notify.warning(message, 'Permissions Updated');
                }
              } catch (teamError) {
                logger.warn('Failed to update team assignments:', teamError);
              }
            } catch (teamError) {
              logger.warn('Error updating team assignments:', teamError);
            }
          }

          if (needsUpdate) {
            notify.success(`User ${values.name} updated successfully.`);

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
              const teamAssignments = Object.entries(
                values.departmentPermissions || {},
              )
                .filter(([, config]) => config.enabled)
                .map(([teamId, config]) => ({
                  teamId,
                  permissions: config.permissions || ['view_analyses'],
                }));

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

          notify.success(`User ${values.name} created successfully.`);

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
      validateEmail,
      validateUsername,
      editingUser,
      currentUser,
      organizationId,
      refreshUserData,
      notify,
      loadUsers,
      form,
      submitOperation,
    ],
  );

  const handleEdit = useCallback(
    async (user) => {
      setEditingUser(user);

      const departmentPermissions = {};

      if (user.role !== 'admin') {
        try {
          const teamMembershipsData = await userService.getUserTeamMemberships(
            user.id,
          );

          if (teamMembershipsData.success && teamMembershipsData.data?.teams) {
            teamMembershipsData.data.teams.forEach((team) => {
              departmentPermissions[team.id] = {
                enabled: true,
                permissions: team.permissions || ['view_analyses'],
              };
            });
            logger.log(
              `✓ Loaded ${teamMembershipsData.data.teams.length} team assignments for user ${user.id}`,
            );
          } else {
            logger.warn('Failed to fetch user team memberships for editing');
          }
        } catch (error) {
          logger.warn('Error fetching user team memberships:', error);
        }
      }

      form.setValues({
        name: user.name || '',
        email: user.email || '',
        username: user.username || '',
        password: '',
        role: user.role || 'user',
        departmentPermissions,
      });
      form.resetDirty();
      setShowCreateForm(true);
    },
    [form],
  );

  const handleDelete = useCallback(
    async (user) => {
      modals.openConfirmModal({
        title: 'Delete User',
        children: `Are you sure you want to delete user "${user.name || user.email}"?`,
        labels: { confirm: 'Delete', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          await deleteOperation.execute(async () => {
            const result = await userService.removeUserFromOrganization(
              user.id,
              organizationId,
            );

            if (result.error) {
              throw new Error(result.error.message);
            }

            // Note: SSE connections are automatically closed by the backend
            // afterRemoveMember hook, so no need to call forceLogout separately

            notify.success(
              `User ${user.name || user.email} deleted successfully.`,
            );

            await loadUsers();
          });
        },
      });
    },
    [notify, loadUsers, organizationId, deleteOperation],
  );

  const handleImpersonate = useCallback(
    async (user) => {
      modals.openConfirmModal({
        title: 'Impersonate User',
        children: `Are you sure you want to impersonate "${user.name || user.email}"? You will be logged in as this user.`,
        labels: { confirm: 'Impersonate', cancel: 'Cancel' },
        confirmProps: { color: 'blue' },
        onConfirm: async () => {
          await impersonateOperation.execute(async () => {
            const result = await admin.impersonateUser({
              userId: user.id,
            });

            if (result.error) {
              throw new Error(result.error.message);
            }

            notify.info(
              `Now impersonating ${user.name || user.email}`,
              'Success',
            );

            // Refetch session to get updated user from Better Auth
            // This will trigger PermissionsContext to auto-reload permissions via useEffect
            await refetchSession();
            logger.log('✓ Session refetched after impersonation start');
          });
        },
      });
    },
    [refetchSession, notify, impersonateOperation],
  );

  const handleManageSessions = useCallback((user) => {
    modalService.openUserSessions(user);
  }, []);

  const handleBanUser = useCallback(
    async (user) => {
      modals.openConfirmModal({
        title: 'Ban User',
        children: `Are you sure you want to ban "${user.name || user.email}"? This will immediately log them out and prevent them from signing in.`,
        labels: { confirm: 'Ban User', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          await banOperation.execute(async () => {
            const result = await admin.banUser({
              userId: user.id,
              banReason: 'Banned by administrator',
            });

            if (result.error) {
              throw new Error(result.error.message);
            }

            // Force logout the banned user
            try {
              await userService.forceLogout(
                user.id,
                'Your account has been banned by an administrator',
              );
              logger.log(`✓ Forced logout for banned user ${user.id}`);
            } catch (logoutError) {
              logger.warn('Failed to force logout banned user:', logoutError);
              // Continue even if force logout fails
            }

            notify.warning(
              `User ${user.name || user.email} has been banned`,
              'Success',
            );

            await loadUsers();
          });
        },
      });
    },
    [loadUsers, notify, banOperation],
  );

  const handleUnbanUser = useCallback(
    async (user) => {
      await unbanOperation.execute(async () => {
        const result = await admin.unbanUser({
          userId: user.id,
        });
        if (result.error) {
          throw new Error(result.error.message);
        }

        notify.success(`User ${user.name || user.email} has been unbanned`);

        await loadUsers();
      });
    },
    [notify, loadUsers, unbanOperation],
  );

  const handleCancel = useCallback(() => {
    setEditingUser(null);
    setShowCreateForm(false);
    setCreatedUserInfo(null);
    form.reset();
    form.clearFieldError('username');
    form.clearFieldError('email');
  }, [form]);

  const handleCreate = useCallback(() => {
    setEditingUser(null);
    form.setValues({
      name: '',
      email: '',
      username: '',
      password: '',
      role: 'user',
      departmentPermissions: {},
    });
    form.resetDirty();
    setShowCreateForm(true);
    form.clearFieldError('username');
    form.clearFieldError('email');
  }, [form]);

  // Listen for SSE events for user role updates
  const handleAdminUserRoleUpdated = useCallback((event) => {
    const data = event.detail;
    logger.log('User management: Received admin user role update event:', data);

    // Update the specific user in the users list without a full reload
    setUsers((prevUsers) => {
      return prevUsers.map((user) => {
        if (user.id === data.userId) {
          logger.log(
            `Updating user ${user.id} role from ${user.role} to ${data.role}`,
          );
          return {
            ...user,
            role: data.role,
          };
        }
        return user;
      });
    });
  }, []);

  useEventListener('admin-user-role-updated', handleAdminUserRoleUpdated);

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
    isRootUser,
    // Functions
    loadUsers,
    loadActions,
    isOnlyAdmin,
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
    toggleDepartment,
    toggleDepartmentPermission,
  };
}
