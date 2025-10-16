import { useState, useCallback, useMemo, useEffect } from 'react';
import { useForm } from '@mantine/form';
import { admin, authClient } from '../lib/auth';
import { userService } from '../services/userService';
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
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState('');
  const [createdUserInfo, setCreatedUserInfo] = useState(null);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [selectedUserForSessions, setSelectedUserForSessions] = useState(null);
  const [actions, setActions] = useState([]);

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
      name: (value) => (!value ? 'Name is required' : null),
    },
  });

  // Load functions
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const result = await admin.listUsers({
        query: {
          limit: 100,
        },
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      setUsers(result.data.users || result.data || []);
    } catch (err) {
      logger.error('Error loading users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActions = useCallback(async () => {
    try {
      const result = await userService.getAvailablePermissions();

      if (result.success && result.data) {
        setActions(result.data);
      } else {
        logger.error('Failed to load permissions:', result.error);
        setActions([]);
      }
    } catch (error) {
      logger.error('Error loading actions:', error);
      setActions([]);
    }
  }, []);

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

  const handleUsernameChange = useCallback(
    async (value) => {
      form.setFieldValue('username', value);
      const error = await validateUsername(value);
      form.setFieldError('username', error || undefined);
    },
    [form, validateUsername],
  );

  const handleEmailChange = useCallback(
    (value) => {
      form.setFieldValue('email', value);
      const error = validateEmail(value);
      form.setFieldError('email', error || undefined);
    },
    [form, validateEmail],
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
      try {
        setLoading(true);
        setError('');

        // Validate email and username before submission
        const emailError = validateEmail(values.email);
        if (emailError) {
          form.setFieldError('email', emailError);
          setLoading(false);
          return;
        }

        if (values.username) {
          const usernameError = await validateUsername(values.username);
          if (usernameError) {
            form.setFieldError('username', usernameError);
            setLoading(false);
            return;
          }
        }

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
              setLoading(false);
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

                notify.showNotification({
                  title: 'Permissions Updated',
                  message,
                  color: assignedTeams > 0 ? 'blue' : 'orange',
                });
              } catch (teamError) {
                logger.warn('Failed to update team assignments:', teamError);
              }
            } catch (teamError) {
              logger.warn('Error updating team assignments:', teamError);
            }
          }

          if (needsUpdate) {
            notify.showNotification({
              title: 'Success',
              message: `User ${values.name} updated successfully.`,
              color: 'green',
            });

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

          notify.showNotification({
            title: 'Success',
            message: `User ${values.name} created successfully.`,
            color: 'green',
          });

          setCreatedUserInfo({
            name: values.name,
            email: values.email,
            tempPassword: autoPassword,
          });

          await loadUsers();
          setShowCreateForm(false);
        }
      } catch (err) {
        setError(err.message || 'Operation failed');
      } finally {
        setLoading(false);
      }
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
    ],
  );

  const handleEdit = useCallback(
    async (user) => {
      setEditingUser(user);
      setLoading(true);

      try {
        const departmentPermissions = {};

        if (user.role !== 'admin') {
          try {
            const teamMembershipsData =
              await userService.getUserTeamMemberships(user.id);

            if (
              teamMembershipsData.success &&
              teamMembershipsData.data?.teams
            ) {
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
      } catch (error) {
        logger.error('Error loading user data for editing:', error);
        setError('Failed to load user data for editing');
      } finally {
        setLoading(false);
      }
    },
    [form],
  );

  const handleDelete = useCallback(
    async (user) => {
      if (
        !confirm(
          `Are you sure you want to delete user "${user.name || user.email}"?`,
        )
      ) {
        return;
      }

      try {
        setLoading(true);
        setError('');

        const result = await userService.removeUserFromOrganization(
          user.id,
          organizationId,
        );

        if (result.error) {
          throw new Error(result.error.message);
        }

        notify.showNotification({
          title: 'Success',
          message: `User ${user.name || user.email} deleted successfully.`,
          color: 'green',
        });

        await loadUsers();
      } catch (err) {
        setError(err.message || 'Failed to delete user');
      } finally {
        setLoading(false);
      }
    },
    [notify, loadUsers, organizationId],
  );

  const handleImpersonate = useCallback(
    async (user) => {
      if (
        !confirm(
          `Are you sure you want to impersonate "${user.name || user.email}"? You will be logged in as this user.`,
        )
      ) {
        return;
      }

      try {
        setLoading(true);
        setError('');

        const result = await admin.impersonateUser({
          userId: user.id,
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        notify.showNotification({
          title: 'Success',
          message: `Now impersonating ${user.name || user.email}`,
          color: 'blue',
        });

        // Refetch session to get updated user from Better Auth
        // This will trigger PermissionsContext to auto-reload permissions via useEffect
        await refetchSession();
        logger.log('✓ Session refetched after impersonation start');
      } catch (err) {
        setError(err.message || 'Failed to impersonate user');
      } finally {
        setLoading(false);
      }
    },
    [refetchSession, notify],
  );

  const handleManageSessions = useCallback((user) => {
    setSelectedUserForSessions(user);
    setShowSessionsModal(true);
  }, []);

  const handleBanUser = useCallback(
    async (user) => {
      if (
        !confirm(
          `Are you sure you want to ban "${user.name || user.email}"? This will immediately log them out and prevent them from signing in.`,
        )
      ) {
        return;
      }

      try {
        setLoading(true);
        setError('');

        const result = await admin.banUser({
          userId: user.id,
          banReason: 'Banned by administrator',
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        notify.showNotification({
          title: 'Success',
          message: `User ${user.name || user.email} has been banned`,
          color: 'orange',
        });

        await loadUsers();
      } catch (err) {
        setError(err.message || 'Failed to ban user');
      } finally {
        setLoading(false);
      }
    },
    [notify, loadUsers],
  );

  const handleUnbanUser = useCallback(
    async (user) => {
      try {
        setLoading(true);
        setError('');

        const result = await admin.unbanUser({
          userId: user.id,
        });
        if (result.error) {
          throw new Error(result.error.message);
        }

        notify.showNotification({
          title: 'Success',
          message: `User ${user.name || user.email} has been unbanned`,
          color: 'green',
        });

        await loadUsers();
      } catch (err) {
        setError(err.message || 'Failed to unban user');
      } finally {
        setLoading(false);
      }
    },
    [notify, loadUsers],
  );

  const handleCancel = useCallback(() => {
    setEditingUser(null);
    setShowCreateForm(false);
    setCreatedUserInfo(null);
    form.reset();
    setError('');
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

  const handleSessionsModalClose = useCallback(() => {
    setShowSessionsModal(false);
    setSelectedUserForSessions(null);
  }, []);

  // Listen for SSE events for user role updates
  useEffect(() => {
    const handleAdminUserRoleUpdated = (event) => {
      const data = event.detail;
      logger.log(
        'User management: Received admin user role update event:',
        data,
      );

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
    };

    // Add event listener
    window.addEventListener(
      'admin-user-role-updated',
      handleAdminUserRoleUpdated,
    );

    // Cleanup
    return () => {
      window.removeEventListener(
        'admin-user-role-updated',
        handleAdminUserRoleUpdated,
      );
    };
  }, []);

  return {
    // State
    users,
    loading,
    editingUser,
    showCreateForm,
    error,
    setError,
    createdUserInfo,
    setCreatedUserInfo,
    showSessionsModal,
    selectedUserForSessions,
    availableTeams,
    actions,
    form,
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
    handleSessionsModalClose,
    handleUsernameChange,
    handleEmailChange,
    toggleDepartment,
    toggleDepartmentPermission,
  };
}
