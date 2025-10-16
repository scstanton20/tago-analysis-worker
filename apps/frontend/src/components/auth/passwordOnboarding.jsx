import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  PasswordInput,
  Button,
  Title,
  Text,
  Box,
  Stack,
  Alert,
  Container,
  Card,
} from '@mantine/core';
import { IconAlertCircle, IconKey } from '@tabler/icons-react';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import Logo from '../ui/logo.jsx';
import { validatePassword } from '../../utils/userValidation';

export default function PasswordOnboarding({
  username,
  onSuccess,
  passwordOnboarding,
}) {
  const notify = useNotifications();
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.newPassword || !formData.confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    // Validate password with new requirements
    const passwordError = validatePassword(formData.newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await passwordOnboarding(formData.newPassword);
      notify.success('Password changed successfully!');
      onSuccess();
    } catch (err) {
      setError(err.message || 'Password change failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  return (
    <Box
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '2rem',
      }}
    >
      <Container size="xs" style={{ width: '100%', maxWidth: 450 }}>
        <Card
          shadow="xl"
          padding="xl"
          radius="lg"
          style={{
            width: '100%',
            maxWidth: 450,
            background: 'var(--mantine-color-body)',
            border: '1px solid var(--mantine-color-gray-3)',
          }}
        >
          <form onSubmit={handleSubmit}>
            <Stack gap="lg">
              <Box ta="center">
                <Logo size={64} />
                <Title
                  order={2}
                  ta="center"
                  mt="md"
                  mb="xs"
                  style={{
                    fontWeight: 800,
                    background:
                      'linear-gradient(45deg, var(--mantine-color-brand-6), var(--mantine-color-accent-6))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Password Change Required
                </Title>
                <Text size="sm" c="dimmed" ta="center">
                  You must change your password before continuing
                </Text>
                <Text size="sm" fw={500} ta="center" mt="xs">
                  Welcome, {username}
                </Text>
              </Box>

              <Alert
                icon={<IconKey size="1rem" />}
                color="orange"
                variant="light"
                radius="md"
              >
                Please set a new password to complete your account setup and
                access the application. Password must be at least 6 characters
                and contain at least one uppercase letter.
              </Alert>

              {error && (
                <Alert
                  icon={<IconAlertCircle size="1rem" />}
                  color="red"
                  variant="light"
                  radius="md"
                >
                  {error}
                </Alert>
              )}

              <Stack gap="md">
                <PasswordInput
                  label="New Password"
                  placeholder="Enter your new password"
                  value={formData.newPassword}
                  onChange={(e) =>
                    handleInputChange('newPassword', e.target.value)
                  }
                  required
                  size="md"
                  autoComplete="new-password"
                  name="new-password"
                  id="new-password"
                />

                <PasswordInput
                  label="Confirm New Password"
                  placeholder="Confirm your new password"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    handleInputChange('confirmPassword', e.target.value)
                  }
                  required
                  size="md"
                  autoComplete="new-password"
                  name="confirm-password"
                  id="confirm-password"
                />
              </Stack>

              <Button
                type="submit"
                loading={loading}
                fullWidth
                size="md"
                leftSection={<IconKey size="1rem" />}
                variant="gradient"
                gradient={{ from: 'brand.6', to: 'accent.6' }}
                radius="md"
                style={{
                  fontWeight: 600,
                }}
              >
                {loading ? 'Changing Password...' : 'Change Password'}
              </Button>
            </Stack>
          </form>
        </Card>
      </Container>
    </Box>
  );
}

PasswordOnboarding.propTypes = {
  username: PropTypes.string.isRequired,
  onSuccess: PropTypes.func.isRequired,
  passwordOnboarding: PropTypes.func.isRequired,
};
