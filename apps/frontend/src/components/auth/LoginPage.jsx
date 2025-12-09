import { useState, useMemo, useCallback } from 'react';
import { useEventListener } from '../../hooks/useEventListener';
import { useInterval, useTimeout } from '../../hooks/useInterval';
import {
  TextInput,
  PasswordInput,
  Title,
  Text,
  Box,
  Stack,
  Container,
  Card,
  Divider,
} from '@mantine/core';
import { IconLogin, IconFingerprint, IconKey } from '@tabler/icons-react';
import {
  FormAlert,
  PrimaryButton,
  SecondaryButton,
  CancelButton,
} from '../global';
import { signIn, signInPasskey, authClient } from '../../lib/auth.js';
import { notificationAPI } from '../../utils/notificationAPI.jsx';
import { useStandardForm } from '../../hooks/forms/useStandardForm';
import { useAsyncOperation } from '../../hooks/async/useAsyncOperation';
import Logo from '../ui/logo';
import { validatePassword } from '../../validation';

// Persists across re-mounts but cleared on page refresh
let storedCurrentPassword = '';

export default function LoginPage() {
  const { form, submitOperation, handleSubmit } = useStandardForm({
    initialValues: {
      username: '',
      password: '',
      currentPasswordForChange: '',
      newPassword: '',
      confirmPassword: '',
    },
    validate: {
      username: (value) => (!value ? 'Email or username is required' : null),
      password: (value) => (!value ? 'Password is required' : null),
      newPassword: (value, values) => {
        if (!values.newPassword && !values.confirmPassword) return null;
        if (!value) return 'New password is required';
        return validatePassword(value);
      },
      confirmPassword: (value, values) => {
        if (!values.newPassword && !values.confirmPassword) return null;
        if (!value) return 'Please confirm your password';
        if (value !== values.newPassword) return 'Passwords do not match';
        return null;
      },
    },
    resetOnSuccess: false,
  });

  const passkeyOperation = useAsyncOperation();
  const passwordChangeOperation = useAsyncOperation();

  const [passwordChangeMode, setPasswordChangeMode] = useState(false);
  const [currentPassword, setCurrentPasswordState] = useState(
    storedCurrentPassword,
  );

  const setCurrentPassword = useCallback((password) => {
    storedCurrentPassword = password;
    setCurrentPasswordState(password);
  }, []);

  // Handle password manager autofill
  const handleAutofill = useCallback(() => {
    setTimeout(() => {
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');

      if (
        usernameInput &&
        usernameInput.value &&
        usernameInput.value !== form.values.username
      ) {
        form.setFieldValue('username', usernameInput.value);
      }
      if (
        passwordInput &&
        passwordInput.value &&
        passwordInput.value !== form.values.password
      ) {
        form.setFieldValue('password', passwordInput.value);
      }
    }, 100);
  }, [form]);

  useEventListener('DOMContentLoaded', handleAutofill, document);
  useEventListener('load', handleAutofill, window);

  const [stopPolling, setStopPolling] = useState(false);
  useInterval(handleAutofill, stopPolling ? null : 500, false);
  useTimeout(() => setStopPolling(true), 3000);

  const handleLogin = handleSubmit(async (values) => {
    const isEmail = values.username.includes('@');

    let result;
    if (isEmail) {
      result = await signIn.email({
        email: values.username,
        password: values.password,
      });
    } else {
      result = await signIn.username({
        username: values.username,
        password: values.password,
      });
    }

    if (result.error) {
      throw new Error(result.error.message);
    }

    // Fetch session to get custom fields like requiresPasswordChange
    const sessionResult = await authClient.getSession();

    if (sessionResult.data?.user?.requiresPasswordChange) {
      setCurrentPassword(values.password);
      setPasswordChangeMode(true);
      return;
    }

    notificationAPI.success(
      'Welcome back! You have been signed in successfully.',
    );
    form.reset();
  });

  const handlePasswordChange = async () => {
    const effectiveCurrentPassword =
      currentPassword || form.values.currentPasswordForChange;

    if (!currentPassword && !form.values.currentPasswordForChange) {
      form.setFieldError(
        'currentPasswordForChange',
        'Current password is required',
      );
      return;
    }

    const newPasswordError = validatePassword(form.values.newPassword);
    if (newPasswordError) {
      form.setFieldError('newPassword', newPasswordError);
      return;
    }
    if (form.values.newPassword !== form.values.confirmPassword) {
      form.setFieldError('confirmPassword', 'Passwords do not match');
      return;
    }

    await passwordChangeOperation.execute(async () => {
      const result = await authClient.changePassword({
        currentPassword: effectiveCurrentPassword,
        newPassword: form.values.newPassword,
        revokeOtherSessions: false,
      });

      if (result.error) {
        throw new Error(result.error.message || 'Failed to change password');
      }

      notificationAPI.success('Password changed successfully!');
      setPasswordChangeMode(false);
      setCurrentPassword('');
      form.reset();
      window.dispatchEvent(new Event('auth-change'));
    });
  };

  const handleCancelPasswordChange = async () => {
    try {
      await authClient.signOut();
    } catch {
      // Ignore sign out errors
    }
    setPasswordChangeMode(false);
    setCurrentPassword('');
    form.reset();
    window.dispatchEvent(new Event('auth-change'));
  };

  const isWebAuthnSupported = useMemo(() => {
    return !!(
      window.PublicKeyCredential &&
      window.navigator.credentials &&
      window.navigator.credentials.create &&
      window.navigator.credentials.get
    );
  }, []);

  const handlePasskeyLogin = async () => {
    await passkeyOperation.execute(async () => {
      const result = await signInPasskey();

      if (result && result.error) {
        throw new Error(
          result.error.message || 'Passkey authentication failed',
        );
      }

      if (result?.data?.user?.requiresPasswordChange) {
        notificationAPI.error(
          'Password change required but not supported for passkey login. Please contact an administrator.',
        );
        return;
      }

      notificationAPI.success(
        'Welcome back! You have been signed in successfully.',
      );
      window.dispatchEvent(new Event('auth-change'));
    });
  };

  if (passwordChangeMode) {
    return (
      <Container size="xs" style={{ minHeight: '100vh' }}>
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem 0',
          }}
        >
          <Card
            shadow="xl"
            padding="xl"
            radius="lg"
            style={{
              width: '100%',
              maxWidth: 400,
              background: 'var(--mantine-color-body)',
              border: '1px solid var(--mantine-color-gray-3)',
            }}
          >
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
              </Box>

              <FormAlert
                type="warning"
                message="Your account requires a password change before you can continue."
              />

              <FormAlert type="error" message={passwordChangeOperation.error} />

              <Stack gap="md">
                {!currentPassword && (
                  <PasswordInput
                    label="Current Password"
                    placeholder="Enter your current password"
                    {...form.getInputProps('currentPasswordForChange')}
                    required
                    size="md"
                    autoComplete="current-password"
                    name="current-password"
                    id="current-password-change"
                    onChange={(e) => {
                      form.setFieldValue(
                        'currentPasswordForChange',
                        e.target.value,
                      );
                      if (passwordChangeOperation.error)
                        passwordChangeOperation.setError(null);
                    }}
                  />
                )}

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
                    if (passwordChangeOperation.error)
                      passwordChangeOperation.setError(null);
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
                    if (passwordChangeOperation.error)
                      passwordChangeOperation.setError(null);
                  }}
                />
              </Stack>

              <Stack gap="sm">
                <PrimaryButton
                  onClick={handlePasswordChange}
                  loading={passwordChangeOperation.loading}
                  fullWidth
                  size="md"
                  leftSection={<IconKey size="1rem" />}
                  radius="md"
                  disabled={
                    (!currentPassword &&
                      !form.values.currentPasswordForChange) ||
                    !form.values.newPassword ||
                    !form.values.confirmPassword ||
                    form.values.newPassword !== form.values.confirmPassword ||
                    !!form.errors.newPassword ||
                    !!form.errors.confirmPassword ||
                    !!form.errors.currentPasswordForChange
                  }
                >
                  {passwordChangeOperation.loading
                    ? 'Changing Password...'
                    : 'Change Password'}
                </PrimaryButton>

                <CancelButton
                  onClick={handleCancelPasswordChange}
                  fullWidth
                  size="md"
                  radius="md"
                  disabled={passwordChangeOperation.loading}
                >
                  Cancel
                </CancelButton>
              </Stack>
            </Stack>
          </Card>
        </Box>
      </Container>
    );
  }

  return (
    <Container size="xs" style={{ minHeight: '100vh' }}>
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem 0',
        }}
      >
        <Card
          shadow="xl"
          padding="xl"
          radius="lg"
          style={{
            width: '100%',
            maxWidth: 400,
            background: 'var(--mantine-color-body)',
            border: '1px solid var(--mantine-color-gray-3)',
          }}
        >
          <form onSubmit={handleLogin}>
            <Stack gap="lg">
              <Box ta="center">
                <Logo size={104} />
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
                  Tago Analysis Worker
                </Title>
                <Text size="sm" c="dimmed" ta="center">
                  Sign in to your account
                </Text>
              </Box>

              <FormAlert
                type="error"
                message={submitOperation.error || passkeyOperation.error}
              />

              <Stack gap="md" key="login-form-fields">
                <TextInput
                  label="Email or Username"
                  placeholder="Enter your email or username"
                  {...form.getInputProps('username')}
                  required
                  size="md"
                  autoComplete="username"
                  name="username"
                  id="username"
                  description="You can sign in with either your email address or username"
                  onChange={(e) => {
                    form.setFieldValue('username', e.target.value);
                    if (submitOperation.error) submitOperation.setError(null);
                  }}
                />

                <PasswordInput
                  label="Password"
                  placeholder="Enter your password"
                  {...form.getInputProps('password')}
                  required
                  size="md"
                  autoComplete="current-password"
                  name="password"
                  id="password"
                  onChange={(e) => {
                    form.setFieldValue('password', e.target.value);
                    if (submitOperation.error) submitOperation.setError(null);
                  }}
                />
              </Stack>

              <PrimaryButton
                type="submit"
                loading={submitOperation.loading}
                fullWidth
                size="md"
                leftSection={<IconLogin size="1rem" />}
                radius="md"
                style={{
                  fontWeight: 600,
                }}
                disabled={passkeyOperation.loading}
              >
                {submitOperation.loading ? 'Signing in...' : 'Sign In'}
              </PrimaryButton>

              {isWebAuthnSupported && (
                <>
                  <Divider label="OR" labelPosition="center" />

                  <SecondaryButton
                    onClick={handlePasskeyLogin}
                    loading={passkeyOperation.loading}
                    fullWidth
                    size="md"
                    leftSection={<IconFingerprint size="1rem" />}
                    color="blue"
                    radius="md"
                    style={{
                      fontWeight: 600,
                    }}
                    disabled={submitOperation.loading}
                  >
                    {passkeyOperation.loading
                      ? 'Authenticating...'
                      : 'Sign in with Passkey'}
                  </SecondaryButton>

                  <Text size="xs" c="dimmed" ta="center">
                    Use Face ID, Touch ID, Windows Hello, or your security key
                  </Text>
                </>
              )}
            </Stack>
          </form>
        </Card>
      </Box>
    </Container>
  );
}
