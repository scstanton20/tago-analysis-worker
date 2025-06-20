import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  PasswordInput,
  Alert,
  Box,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUser, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';

export default function ProfileModal({ opened, onClose }) {
  const { user, changePassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const form = useForm({
    initialValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    validate: {
      currentPassword: (value) =>
        !value ? 'Current password is required' : null,
      newPassword: (value) =>
        !value
          ? 'New password is required'
          : value.length < 6
            ? 'Password must be at least 6 characters'
            : null,
      confirmPassword: (value, values) =>
        value !== values.newPassword ? 'Passwords do not match' : null,
    },
  });

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      setError('');
      setSuccess(false);

      await changePassword(values.currentPassword, values.newPassword);

      setSuccess(true);
      form.reset();

      // Auto-close after success
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setError('');
    setSuccess(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <IconUser size={20} />
          <Text fw={600}>Profile Settings</Text>
        </Group>
      }
      size="md"
      centered
    >
      <Stack gap="md">
        {/* User Info */}
        <Box
          p="md"
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--mantine-color-gray-3)',
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Username:
              </Text>
              <Text size="sm">{user?.username}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Email:
              </Text>
              <Text size="sm">{user?.email}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Role:
              </Text>
              <Text size="sm" transform="capitalize">
                {user?.role}
              </Text>
            </Group>
          </Stack>
        </Box>

        {/* Change Password Form */}
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Text fw={500} size="sm">
              Change Password
            </Text>

            {error && (
              <Alert
                icon={<IconAlertCircle size="1rem" />}
                color="red"
                variant="light"
              >
                {error}
              </Alert>
            )}

            {success && (
              <Alert
                icon={<IconCheck size="1rem" />}
                color="green"
                variant="light"
              >
                Password changed successfully!
              </Alert>
            )}

            <PasswordInput
              label="Current Password"
              placeholder="Enter your current password"
              required
              {...form.getInputProps('currentPassword')}
            />

            <PasswordInput
              label="New Password"
              placeholder="Enter new password (min 6 characters)"
              required
              {...form.getInputProps('newPassword')}
            />

            <PasswordInput
              label="Confirm New Password"
              placeholder="Confirm your new password"
              required
              {...form.getInputProps('confirmPassword')}
            />

            <Group justify="flex-end" gap="sm" mt="md">
              <Button
                variant="default"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={loading}
                disabled={success}
                variant="gradient"
                gradient={{ from: 'brand.6', to: 'accent.6' }}
              >
                Change Password
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Modal>
  );
}

ProfileModal.propTypes = {
  opened: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
