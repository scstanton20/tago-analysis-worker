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
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUser,
  IconAlertCircle,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthProvider';
import { signUp, admin } from '../../lib/auth';
import { useNotifications } from '../../hooks/useNotifications.jsx';

export default function UserManagementModal({ opened, onClose }) {
  const { user: currentUser, isAdmin } = useAuth();
  const notify = useNotifications();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState('');
  const [createdUserInfo, setCreatedUserInfo] = useState(null);

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
        // Prevent editing other users until admin endpoints are implemented
        if (editingUser.id !== currentUser?.id) {
          throw new Error('User editing not yet available');
        }

        // For self-editing, redirect to profile modal
        throw new Error(
          'Please use the profile settings to update your own information',
        );
      } else {
        // Create user using Better Auth signUp
        const result = await signUp.email({
          name: values.name,
          email: values.email,
          password: values.password,
          username: values.username,
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        // Set role using Better Auth admin client if not default viewer
        if (values.role !== 'viewer') {
          const roleResult = await admin.setRole({
            userId: result.data.user.id,
            role: values.role,
          });
          if (roleResult.error) {
            throw new Error(roleResult.error.message);
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
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <ActionIcon
                              variant="light"
                              color="blue"
                              size="sm"
                              onClick={() => handleEdit(user)}
                              title={
                                user.id === currentUser?.id && isOnlyAdmin()
                                  ? 'Use Profile Settings to update your information'
                                  : 'Edit user'
                              }
                            >
                              <IconEdit size="1rem" />
                            </ActionIcon>
                            {user.id !== currentUser?.id && (
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
                    label="Name"
                    placeholder="Enter full name"
                    required
                    disabled={
                      editingUser?.id === currentUser?.id && isOnlyAdmin()
                    }
                    {...form.getInputProps('name')}
                  />

                  <TextInput
                    label="Email"
                    placeholder="Enter email address"
                    required
                    disabled={
                      editingUser?.id === currentUser?.id && isOnlyAdmin()
                    }
                    {...form.getInputProps('email')}
                  />

                  <TextInput
                    label="Username (Optional)"
                    placeholder="Enter username for login"
                    description="Users can login with either email or username"
                    disabled={
                      editingUser?.id === currentUser?.id && isOnlyAdmin()
                    }
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
                    disabled={
                      editingUser?.id === currentUser?.id && isOnlyAdmin()
                    }
                    {...form.getInputProps('password')}
                  />

                  <Select
                    label="Global Role"
                    placeholder="Select global role"
                    required
                    disabled={
                      editingUser?.id === currentUser?.id && isOnlyAdmin()
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

                  {editingUser?.id === currentUser?.id && isOnlyAdmin() && (
                    <Alert
                      icon={<IconUser size="1rem" />}
                      color="blue"
                      variant="light"
                    >
                      <Text size="sm">
                        Please use the profile settings to update your own
                        information.
                      </Text>
                    </Alert>
                  )}

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
    </Modal>
  );
}
