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
  Menu,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUser,
  IconAlertCircle,
  IconUserCheck,
  IconLogout,
  IconBan,
  IconCircleCheck,
  IconDotsVertical,
  IconDeviceLaptop,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthProvider';
import { admin } from '../../lib/auth';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import UserSessionsModal from './userSessionsModal';

export default function UserManagementModal({ opened, onClose }) {
  const { user: currentUser, isAdmin } = useAuth();
  const notify = useNotifications();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState('');
  const [createdUserInfo, setCreatedUserInfo] = useState(null);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [selectedUserForSessions, setSelectedUserForSessions] = useState(null);

  const form = useForm({
    initialValues: {
      name: '',
      email: '',
      username: '',
      password: '',
      role: 'viewer',
    },
    validate: {
      name: (value) => (!value ? 'Name is required' : null),
      email: (value) =>
        !value
          ? 'Email is required'
          : !/^\S+@\S+$/.test(value)
            ? 'Invalid email format'
            : null,
      username: (value) => {
        if (!value) return null; // Username is optional
        if (value.length < 3) return 'Username must be at least 3 characters';
        if (!/^[a-zA-Z0-9_-]+$/.test(value))
          return 'Username can only contain letters, numbers, hyphens, and underscores';
        return null;
      },
      password: (value) =>
        !editingUser && (!value || value.length < 8)
          ? 'Password must be at least 8 characters'
          : null,
    },
  });

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Use Better Auth admin client to list users with correct syntax
      console.log('Current user admin status:', admin);
      console.log('Attempting to list users...');

      const result = await admin.listUsers({
        query: {
          limit: 100, // Get up to 100 users
        },
      });

      console.log('List users result:', result);

      if (result.error) {
        throw new Error(result.error.message);
      }

      setUsers(result.data.users || result.data || []);
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  // Helper function to check if current user is the only admin
  const isOnlyAdmin = () => {
    const adminUsers = users.filter((user) => user.role === 'admin');
    return (
      adminUsers.length === 1 &&
      currentUser?.role === 'admin' &&
      adminUsers[0]?.id === currentUser?.id
    );
  };

  useEffect(() => {
    if (opened && isAdmin) {
      loadUsers();
      setError('');
    }
  }, [opened, isAdmin, loadUsers]);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      setError('');

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
          updates.role = values.role;
          needsUpdate = true;
        }

        // Note: Better Auth admin plugin doesn't provide updateUser for basic details
        // Only role and password changes are supported for admin user management

        // Update password if provided
        if (values.password && values.password.trim()) {
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

        if (needsUpdate) {
          notify.showNotification({
            title: 'Success',
            message: `User ${values.name} updated successfully.`,
            color: 'green',
          });
        }
      } else {
        // Create user using Better Auth admin createUser to avoid auto-login
        console.log('Creating user with values:', {
          name: values.name,
          email: values.email,
          username: values.username,
          role: values.role,
        });

        // Create user with all data including username
        const createUserData = {
          name: values.name,
          email: values.email,
          password: values.password,
          role: values.role,
        };

        // Add username to data field if provided
        if (values.username && values.username.trim()) {
          createUserData.data = {
            username: values.username,
            displayUsername: values.username, // Both fields are needed for username plugin
          };
        }

        const result = await admin.createUser(createUserData);

        console.log('Create user result:', result);

        if (result.error) {
          throw new Error(result.error.message);
        }

        notify.showNotification({
          title: 'Success',
          message: `User ${values.name} created successfully.`,
          color: 'green',
        });

        setCreatedUserInfo({
          name: values.name,
          email: values.email,
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
    form.setValues({
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
      password: '',
      role: user.role || 'viewer',
    });
    setShowCreateForm(true);
  };

  const handleDelete = async (user) => {
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

      const result = await admin.removeUser({
        userId: user.id,
      });

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
  };

  const handleImpersonate = async (user) => {
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

      // Refresh the page to update the auth context
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Failed to impersonate user');
    } finally {
      setLoading(false);
    }
  };

  const handleManageSessions = (user) => {
    setSelectedUserForSessions(user);
    setShowSessionsModal(true);
  };

  const handleBanUser = async (user) => {
    if (
      !confirm(
        `Are you sure you want to ban "${user.name || user.email}"? This will prevent them from signing in.`,
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
  };

  const handleUnbanUser = async (user) => {
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
    form.setValues({
      name: '',
      email: '',
      username: '',
      password: '',
      role: 'viewer',
    });
    setShowCreateForm(true);
  };

  const handleModalClose = () => {
    handleCancel();
    onClose();
  };

  const handleSessionsModalClose = () => {
    setShowSessionsModal(false);
    setSelectedUserForSessions(null);
  };

  // Only show if user is admin
  if (!isAdmin) {
    return null;
  }

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
                    <Text fw={500}>Name: {createdUserInfo.name}</Text>
                    <Text fw={500}>Email: {createdUserInfo.email}</Text>
                    <Text size="sm" c="dimmed">
                      The user can now sign in with their email and password.
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
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Username</Table.Th>
                      <Table.Th>Role</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {users.map((user) => (
                      <Table.Tr key={user.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <Text fw={user.id === currentUser?.id ? 600 : 400}>
                              {user.name || 'Unknown'}
                            </Text>
                            {user.id === currentUser?.id && (
                              <Badge size="xs" variant="light" color="brand">
                                You
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>{user.email}</Table.Td>
                        <Table.Td>
                          <Text
                            size="sm"
                            c={user.username ? undefined : 'dimmed'}
                          >
                            {user.username || 'Not set'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Badge
                              variant="light"
                              color={
                                user.role === 'admin'
                                  ? 'red'
                                  : user.role === 'analyst'
                                    ? 'orange'
                                    : user.role === 'operator'
                                      ? 'yellow'
                                      : 'blue'
                              }
                            >
                              {user.role || 'viewer'}
                            </Badge>
                            {user.banned && (
                              <Badge variant="light" color="red" size="xs">
                                Banned
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Menu shadow="md" width={200} closeOnItemClick={true}>
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                size="lg"
                                color="brand"
                              >
                                <IconDotsVertical size={20} />
                              </ActionIcon>
                            </Menu.Target>

                            <Menu.Dropdown>
                              {/* Edit User */}
                              <Menu.Item
                                onClick={() => handleEdit(user)}
                                leftSection={<IconEdit size={16} />}
                              >
                                Edit User
                              </Menu.Item>

                              {user.id !== currentUser?.id && (
                                <>
                                  <Menu.Divider />

                                  {/* Impersonate User */}
                                  <Menu.Item
                                    onClick={() => handleImpersonate(user)}
                                    leftSection={<IconUserCheck size={16} />}
                                    color="violet"
                                  >
                                    Impersonate User
                                  </Menu.Item>

                                  {/* Manage Sessions */}
                                  <Menu.Item
                                    onClick={() => handleManageSessions(user)}
                                    leftSection={<IconDeviceLaptop size={16} />}
                                    color="blue"
                                  >
                                    Manage Sessions
                                  </Menu.Item>

                                  <Menu.Divider />

                                  {/* Ban/Unban User */}
                                  {user.banned ? (
                                    <Menu.Item
                                      onClick={() => handleUnbanUser(user)}
                                      leftSection={
                                        <IconCircleCheck size={16} />
                                      }
                                      color="green"
                                    >
                                      Unban User
                                    </Menu.Item>
                                  ) : (
                                    <Menu.Item
                                      onClick={() => handleBanUser(user)}
                                      leftSection={<IconBan size={16} />}
                                      color="red"
                                    >
                                      Ban User
                                    </Menu.Item>
                                  )}

                                  {/* Delete User */}
                                  <Menu.Item
                                    onClick={() => handleDelete(user)}
                                    leftSection={<IconTrash size={16} />}
                                    color="red"
                                  >
                                    Delete User
                                  </Menu.Item>
                                </>
                              )}
                            </Menu.Dropdown>
                          </Menu>
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

                  {editingUser && editingUser.id !== currentUser?.id && (
                    <Alert color="blue" variant="light">
                      <Text size="sm">
                        As an admin, you can change this user's role and reset
                        their password. The user must update their own name,
                        email, and username through their profile settings.
                      </Text>
                    </Alert>
                  )}

                  <TextInput
                    label="Name"
                    placeholder="Enter full name"
                    required
                    disabled={!!editingUser}
                    description={
                      editingUser
                        ? 'User must update their own name through profile settings'
                        : undefined
                    }
                    {...form.getInputProps('name')}
                  />

                  <TextInput
                    label="Email"
                    placeholder="Enter email address"
                    required
                    disabled={!!editingUser}
                    description={
                      editingUser
                        ? 'User must update their own email through profile settings'
                        : undefined
                    }
                    {...form.getInputProps('email')}
                  />

                  <TextInput
                    label="Username (Optional)"
                    placeholder="Enter username for login"
                    description={
                      editingUser
                        ? 'User must update their own username through profile settings'
                        : 'Users can login with either email or username'
                    }
                    disabled={!!editingUser}
                    {...form.getInputProps('username')}
                  />

                  <PasswordInput
                    label={
                      editingUser
                        ? 'New Password (leave blank to keep current)'
                        : 'Password'
                    }
                    placeholder="Enter password"
                    required={!editingUser}
                    {...form.getInputProps('password')}
                  />

                  <Select
                    label="Global Role"
                    placeholder="Select global role"
                    required
                    disabled={
                      editingUser?.id === currentUser?.id &&
                      editingUser?.role === 'admin' &&
                      isOnlyAdmin()
                    }
                    data={[
                      { value: 'viewer', label: 'Viewer - Can view analyses' },
                      {
                        value: 'operator',
                        label: 'Operator - Can view and run analyses',
                      },
                      {
                        value: 'analyst',
                        label: 'Analyst - Can upload, run, and manage analyses',
                      },
                      {
                        value: 'admin',
                        label: 'Administrator - Full system access',
                      },
                    ]}
                    {...form.getInputProps('role')}
                  />

                  {form.values.role === 'admin' && (
                    <Alert color="blue" variant="light">
                      Administrators have full access to all features and can
                      manage other users.
                    </Alert>
                  )}

                  {editingUser &&
                    editingUser.id === currentUser?.id &&
                    editingUser.role === 'admin' &&
                    form.values.role !== 'admin' && (
                      <Alert color="orange" variant="light">
                        Warning: There must be at least one administrator. Since
                        you are the only admin, you cannot change your own role.
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

      {/* Sessions Management Modal */}
      <UserSessionsModal
        opened={showSessionsModal}
        onClose={handleSessionsModalClose}
        user={selectedUserForSessions}
      />
    </Modal>
  );
}
