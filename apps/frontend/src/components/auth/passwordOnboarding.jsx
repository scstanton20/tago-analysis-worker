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
import { notificationAPI } from '../../utils/notificationAPI.jsx';
import { useStandardForm } from '../../hooks/forms/useStandardForm';
import { FormAlert, PrimaryButton } from '../global';
import Logo from '../ui/logo.jsx';
import { validatePassword } from '../../validation';

export default function PasswordOnboarding({
  username,
  onSuccess,
  passwordOnboarding,
}) {
  // Initialize form with useStandardForm
  const { form, submitOperation, handleSubmit } = useStandardForm({
    initialValues: {
      newPassword: '',
      confirmPassword: '',
    },
    validate: {
      newPassword: (value) => {
        if (!value) return 'Password is required';
        return validatePassword(value);
      },
      confirmPassword: (value, values) => {
        if (!value) return 'Please confirm your password';
        if (value !== values.newPassword) return 'Passwords do not match';
        return null;
      },
    },
    resetOnSuccess: true,
  });

  const handlePasswordChange = handleSubmit(async (values) => {
    await passwordOnboarding(values.newPassword);
    notificationAPI.success('Password changed successfully!');
    onSuccess();
  });

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
          <form onSubmit={handlePasswordChange}>
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

              <FormAlert type="error" message={submitOperation.error} />

              <Stack gap="md">
                <PasswordInput
                  label="New Password"
                  placeholder="Enter your new password"
                  {...form.getInputProps('newPassword')}
                  description="Must be at least 6 characters with one uppercase letter"
                  required
                  size="md"
                  autoComplete="new-password"
                  name="new-password"
                  id="new-password"
                  onChange={(e) => {
                    form.setFieldValue('newPassword', e.target.value);
                    if (submitOperation.error) submitOperation.setError(null);
                  }}
                />

                <PasswordInput
                  label="Confirm New Password"
                  placeholder="Confirm your new password"
                  {...form.getInputProps('confirmPassword')}
                  required
                  size="md"
                  autoComplete="new-password"
                  name="confirm-password"
                  id="confirm-password"
                  onChange={(e) => {
                    form.setFieldValue('confirmPassword', e.target.value);
                    if (submitOperation.error) submitOperation.setError(null);
                  }}
                />
              </Stack>

              <PrimaryButton
                type="submit"
                loading={submitOperation.loading}
                disabled={!form.isValid()}
                fullWidth
                size="md"
                leftSection={<IconKey size="1rem" />}
                radius="md"
                style={{
                  fontWeight: 600,
                }}
              >
                {submitOperation.loading
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
