import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  PasswordInput,
  Title,
  Text,
  Box,
  Stack,
  Container,
  Card,
} from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import { useAsyncOperation } from '../../hooks/async/useAsyncOperation';
import { FormAlert, PrimaryButton } from '../global';
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

  const passwordChangeOperation = useAsyncOperation();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.newPassword || !formData.confirmPassword) {
      passwordChangeOperation.setError('Please fill in all fields');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      passwordChangeOperation.setError('New passwords do not match');
      return;
    }

    // Validate password with new requirements
    const passwordError = validatePassword(formData.newPassword);
    if (passwordError) {
      passwordChangeOperation.setError(passwordError);
      return;
    }

    await passwordChangeOperation.execute(async () => {
      await passwordOnboarding(formData.newPassword);
      notify.success('Password changed successfully!');
      onSuccess();
    });
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (passwordChangeOperation.error) {
      passwordChangeOperation.setError(null);
    }
  };

  // Check if form is valid and button should be enabled
  const isFormValid =
    formData.newPassword &&
    formData.confirmPassword &&
    formData.newPassword === formData.confirmPassword &&
    !validatePassword(formData.newPassword);

  // Real-time validation feedback
  const getPasswordError = () => {
    if (!formData.newPassword) return null;
    return validatePassword(formData.newPassword);
  };

  const getConfirmPasswordError = () => {
    if (!formData.confirmPassword) return null;
    if (formData.newPassword && formData.confirmPassword) {
      if (formData.newPassword !== formData.confirmPassword) {
        return 'Passwords do not match';
      }
    }
    return null;
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

              <FormAlert type="error" message={passwordChangeOperation.error} />

              <Stack gap="md">
                <PasswordInput
                  label="New Password"
                  placeholder="Enter your new password"
                  value={formData.newPassword}
                  onChange={(e) =>
                    handleInputChange('newPassword', e.target.value)
                  }
                  error={getPasswordError()}
                  description="Must be at least 6 characters with one uppercase letter"
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
                  error={getConfirmPasswordError()}
                  required
                  size="md"
                  autoComplete="new-password"
                  name="confirm-password"
                  id="confirm-password"
                />
              </Stack>

              <PrimaryButton
                type="submit"
                loading={passwordChangeOperation.loading}
                disabled={!isFormValid}
                fullWidth
                size="md"
                leftSection={<IconKey size="1rem" />}
                radius="md"
                style={{
                  fontWeight: 600,
                }}
              >
                {passwordChangeOperation.loading
                  ? 'Changing Password...'
                  : 'Change Password'}
              </PrimaryButton>
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
