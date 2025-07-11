import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  Text,
  Table,
  ActionIcon,
  TextInput,
  PasswordInput,
  Select,
  Alert,
  Badge,
  Box,
  Paper,
  LoadingOverlay,
  Checkbox,
  ScrollArea,
  ColorSwatch,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUser,
  IconAlertCircle,
} from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
import { useSSE } from '../../contexts/sseContext';
import { useNotifications } from '../../hooks/useNotifications.jsx';

export default function UserManagementModal({ opened, onClose }) {
  const {
    getAllUsers,
    createUser,
    updateUser,
    deleteUser,
    getAvailableActions,
    refreshPermissions,
    user: currentUser,
  } = useAuth();
  const { departments: wsaDepartments } = useSSE();
  const notify = useNotifications();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState('');
  const [createdUserInfo, setCreatedUserInfo] = useState(null);
  const [actions, setActions] = useState([]);

  // Convert SSE departments to array format, filtering out uncategorized
  const departments = Object.values(wsaDepartments || {}).filter(
    (dept) => dept.id !== 'uncategorized',
  );

  const form = useForm({
    initialValues: {
      username: '',
      email: '',
      password: '',
      role: 'user',
      departmentPermissions: {}, // { departmentId: { enabled: boolean, permissions: string[] } }
    },
    validate: {
      username: (value) => (!value ? 'Username is required' : null),
      email: (value) =>
        !value
          ? 'Email is required'
          : !/^\S+@\S+$/.test(value)
            ? 'Invalid email format'
            : null,
      password: (value) =>
        editingUser && value && value.length < 6
          ? 'Password must be at least 6 characters'
          : null,
    },
  });

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getAllUsers();
      setUsers(response.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [getAllUsers]);

  const loadRBACData = useCallback(async () => {
    try {
      // Only load actions if not already loaded to reduce API calls
      if (actions.length === 0) {
        // Get actions from API (still needed)
        const actionsResponse = await getAvailableActions();

        // Filter out manage_departments since it's admin-only
        const userActions =
          actionsResponse.actions?.filter(
            (action) => action.id !== 'manage_departments',
          ) || [];

        setActions(
          userActions.map((action) => ({
            value: action.id,
            label: action.name,
          })),
        );
      }
    } catch (err) {
      console.error('Failed to load RBAC data:', err);
    }
  }, [getAvailableActions, actions.length]);

  useEffect(() => {
    if (opened) {
      loadUsers();
      loadRBACData();
      setError('');
    }
  }, [opened, loadUsers, loadRBACData]);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      setError('');

      // Validate that users have at least one department
      if (values.role === 'user') {
        const enabledDepartments = Object.keys(
          values.departmentPermissions || {},
        ).filter((deptId) => values.departmentPermissions[deptId]?.enabled);

        if (enabledDepartments.length === 0) {
          setError('Users must be assigned to at least one department.');
          setLoading(false);
          return;
        }
      }

      if (editingUser) {
        // Update user - include all data in single request
        const userUpdateData = {
          username: values.username,
          email: values.email,
          role: values.role,
        };

        // Only include password if provided
        if (values.password) {
          userUpdateData.password = values.password;
        }

        // Include permissions for non-admin users
        if (values.role === 'user') {
          // Convert departmentPermissions to backend format
          const enabledDepartments = Object.keys(
            values.departmentPermissions || {},
          ).filter((deptId) => values.departmentPermissions[deptId]?.enabled);

          const allActions = new Set();
          enabledDepartments.forEach((deptId) => {
            const deptPerms =
              values.departmentPermissions[deptId]?.permissions || [];
            deptPerms.forEach((action) => allActions.add(action));
          });

          userUpdateData.departments = enabledDepartments;
          userUpdateData.actions = Array.from(allActions);
        }

        // Single request to update everything
        await notify.executeWithNotification(
          updateUser(editingUser.id, userUpdateData),
          {
            loading: `Updating user ${editingUser.username}...`,
            success: `User ${editingUser.username} updated successfully.`,
          },
        );

        // Refresh permissions if updating current user
        if (editingUser.username === currentUser?.username) {
          await refreshPermissions();
        }

        await loadUsers();
        handleCancel();
      } else {
        // Create user - don't pass password, let backend generate it
        const createData = { ...values };
        delete createData.password;
        const response = await notify.executeWithNotification(
          createUser(createData),
          {
            loading: `Creating user ${values.username}...`,
            success: `User ${values.username} created successfully.`,
          },
        );

        // Show the generated password to admin
        setCreatedUserInfo({
          username: response.user.username,
          defaultPassword: response.defaultPassword,
        });

        await loadUsers();
        setShowCreateForm(false);
      }
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);

    // Convert backend format to departmentPermissions structure
    const departmentPermissions = {};
    const userDepartments = user.permissions?.departments || [];
    const userActions = user.permissions?.actions || [];

    // Initialize all departments with default structure
    departments.forEach((dept) => {
      const isEnabled = userDepartments.includes(dept.id);
      departmentPermissions[dept.id] = {
        enabled: isEnabled,
        permissions: isEnabled ? userActions : ['view_analyses'], // Default to view_analyses
      };
    });

    form.setValues({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      departmentPermissions,
    });
    setShowCreateForm(true);
  };

  const handleDelete = async (user) => {
    if (!confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      await notify.executeWithNotification(deleteUser(user.id), {
        loading: `Deleting user ${user.username}...`,
        success: `User ${user.username} deleted successfully.`,
      });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditingUser(null);
    setShowCreateForm(false);
    setCreatedUserInfo(null);
    form.reset();
    setError('');
  };

  const handleCreate = () => {
    setEditingUser(null);

    // Initialize departmentPermissions structure for new user
    const departmentPermissions = {};
    departments.forEach((dept) => {
      departmentPermissions[dept.id] = {
        enabled: false,
        permissions: [],
      };
    });

    form.setValues({
      username: '',
      email: '',
      password: '',
      role: 'user',
      departmentPermissions,
    });
    setShowCreateForm(true);
  };

  const handleModalClose = () => {
    handleCancel();
    onClose();
  };

  // Helper functions for department permissions
  const toggleDepartment = (departmentId) => {
    const current = form.values.departmentPermissions[departmentId] || {
      enabled: false,
      permissions: [],
    };
    const newEnabled = !current.enabled;

    form.setFieldValue(`departmentPermissions.${departmentId}`, {
      enabled: newEnabled,
      permissions: newEnabled ? ['view_analyses'] : [], // Default to view_analyses when enabling
    });
  };

  const toggleDepartmentPermission = (departmentId, permission) => {
    const current = form.values.departmentPermissions[departmentId] || {
      enabled: false,
      permissions: [],
    };
    const currentPermissions = current.permissions || [];

    let newPermissions;
    if (currentPermissions.includes(permission)) {
      // Remove permission, but keep view_analyses if it's the last one
      newPermissions = currentPermissions.filter((p) => p !== permission);
      if (newPermissions.length === 0) {
        newPermissions = ['view_analyses'];
      }
    } else {
      // Add permission
      newPermissions = [...currentPermissions, permission];
    }

    form.setFieldValue(
      `departmentPermissions.${departmentId}.permissions`,
      newPermissions,
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      title={
        <Group gap="xs">
          <IconUser size={20} />
          <Text fw={600}>User Management</Text>
        </Group>
      }
      size="lg"
      centered
    >
      <Box pos="relative">
        <LoadingOverlay visible={loading} />

        <Stack gap="md">
          {error && (
            <Alert
              icon={<IconAlertCircle size="1rem" />}
              color="red"
              variant="light"
            >
              {error}
            </Alert>
          )}

          {createdUserInfo ? (
            <Paper withBorder p="md">
              <Stack gap="md">
                <Text fw={600} size="lg" ta="center" c="green">
                  User Created Successfully!
                </Text>

                <Alert color="green" variant="light">
                  <Stack gap="xs">
                    <Text fw={500}>Username: {createdUserInfo.username}</Text>
                    <Text fw={500}>
                      Temporary Password: {createdUserInfo.defaultPassword}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Please provide this password to the user. They will be
                      required to change it on first login.
                    </Text>
                  </Stack>
                </Alert>

                <Button
                  onClick={() => setCreatedUserInfo(null)}
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                >
                  Continue
                </Button>
              </Stack>
            </Paper>
          ) : !showCreateForm ? (
            <>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Manage user accounts and permissions
                </Text>
                <Button
                  leftSection={<IconPlus size="1rem" />}
                  onClick={handleCreate}
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                  size="sm"
                >
                  Add User
                </Button>
              </Group>

              <Paper withBorder p="xs">
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Username</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Role</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {users.map((user) => (
                      <Table.Tr key={user.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <Text
                              fw={
                                user.username === currentUser?.username
                                  ? 600
                                  : 400
                              }
                            >
                              {user.username}
                            </Text>
                            {user.username === currentUser?.username && (
                              <Badge size="xs" variant="light" color="brand">
                                You
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>{user.email}</Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={user.role === 'admin' ? 'red' : 'blue'}
                          >
                            {user.role}
                          </Badge>
                          {user.mustChangePassword && (
                            <Badge
                              size="xs"
                              variant="light"
                              color="orange"
                              ml="xs"
                            >
                              Must change password
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <ActionIcon
                              variant="light"
                              color="blue"
                              size="sm"
                              onClick={() => handleEdit(user)}
                            >
                              <IconEdit size="1rem" />
                            </ActionIcon>
                            {user.username !== currentUser?.username && (
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="sm"
                                onClick={() => handleDelete(user)}
                              >
                                <IconTrash size="1rem" />
                              </ActionIcon>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </>
          ) : (
            <Paper withBorder p="md">
              <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                  <Text fw={600} size="lg">
                    {editingUser ? 'Edit User' : 'Create New User'}
                  </Text>

                  <TextInput
                    label="Username"
                    placeholder="Enter username"
                    required
                    disabled={!!editingUser}
                    {...form.getInputProps('username')}
                  />

                  <TextInput
                    label="Email"
                    placeholder="Enter email address"
                    required
                    {...form.getInputProps('email')}
                  />

                  {editingUser && (
                    <PasswordInput
                      label="New Password (leave blank to keep current)"
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      name="admin-new-password"
                      id="admin-new-password"
                      {...form.getInputProps('password')}
                    />
                  )}

                  {!editingUser && (
                    <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                      A temporary password will be automatically generated for
                      the user.
                    </Text>
                  )}

                  <Select
                    label="Role"
                    placeholder="Select role"
                    required
                    data={[
                      { value: 'user', label: 'User' },
                      { value: 'admin', label: 'Administrator' },
                    ]}
                    {...form.getInputProps('role')}
                  />

                  {form.values.role === 'user' && (
                    <Stack gap="md">
                      <Text size="sm" fw={500}>
                        Department Access & Permissions
                      </Text>
                      <Text size="xs" c="dimmed">
                        Select departments and assign specific permissions for
                        each. View analyses is automatically assigned when a
                        department is enabled.
                      </Text>

                      <ScrollArea h={300} offsetScrollbars>
                        <Stack gap="xs">
                          {departments.map((department) => {
                            const deptPerms = form.values.departmentPermissions[
                              department.id
                            ] || { enabled: false, permissions: [] };
                            const isEnabled = deptPerms.enabled;
                            const permissions = deptPerms.permissions || [];

                            return (
                              <Paper
                                key={department.id}
                                withBorder
                                p="md"
                                style={{
                                  backgroundColor: isEnabled
                                    ? 'var(--mantine-color-blue-light)'
                                    : 'transparent',
                                  borderColor: isEnabled
                                    ? 'var(--mantine-color-blue-6)'
                                    : 'var(--mantine-color-gray-3)',
                                }}
                              >
                                <Stack gap="sm">
                                  {/* Department Header */}
                                  <Group
                                    justify="space-between"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() =>
                                      toggleDepartment(department.id)
                                    }
                                  >
                                    <Group gap="sm">
                                      <Checkbox
                                        checked={isEnabled}
                                        onChange={() =>
                                          toggleDepartment(department.id)
                                        }
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <ColorSwatch
                                        color={department.color}
                                        size={16}
                                      />
                                      <Text fw={500} size="sm">
                                        {department.name}
                                      </Text>
                                    </Group>
                                    {isEnabled && (
                                      <Badge
                                        size="xs"
                                        variant="light"
                                        color="blue"
                                      >
                                        {permissions.length} permission
                                        {permissions.length !== 1 ? 's' : ''}
                                      </Badge>
                                    )}
                                  </Group>

                                  {/* Permissions for this department */}
                                  {isEnabled && (
                                    <Box ml="xl">
                                      <Stack gap="xs">
                                        {actions.map((action) => (
                                          <Group key={action.value} gap="sm">
                                            <Checkbox
                                              size="sm"
                                              checked={permissions.includes(
                                                action.value,
                                              )}
                                              onChange={() =>
                                                toggleDepartmentPermission(
                                                  department.id,
                                                  action.value,
                                                )
                                              }
                                              disabled={
                                                action.value === 'view_analyses'
                                              } // Always enabled as default
                                              label={
                                                <Text size="sm">
                                                  {action.label}
                                                  {action.value ===
                                                    'view_analyses' && (
                                                    <Text
                                                      component="span"
                                                      size="xs"
                                                      c="dimmed"
                                                      ml="xs"
                                                    >
                                                      (default)
                                                    </Text>
                                                  )}
                                                </Text>
                                              }
                                            />
                                          </Group>
                                        ))}
                                      </Stack>
                                    </Box>
                                  )}
                                </Stack>
                              </Paper>
                            );
                          })}
                        </Stack>
                      </ScrollArea>
                    </Stack>
                  )}

                  {form.values.role === 'admin' && (
                    <Alert color="blue" variant="light">
                      Administrators have full access to all departments and all
                      permissions.
                    </Alert>
                  )}

                  <Group justify="flex-end" gap="sm">
                    <Button variant="default" onClick={handleCancel}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="gradient"
                      gradient={{ from: 'brand.6', to: 'accent.6' }}
                    >
                      {editingUser ? 'Update User' : 'Create User'}
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Paper>
          )}
        </Stack>
      </Box>
    </Modal>
  );
}
