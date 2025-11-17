import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
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
import { IconLogin, IconFingerprint } from '@tabler/icons-react';
import { FormAlert, PrimaryButton, SecondaryButton } from '../global';
import { signIn, signInPasskey } from '../../lib/auth.js';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import { useStandardForm } from '../../hooks/forms/useStandardForm';
import { useAsyncOperation } from '../../hooks/async/useAsyncOperation';
import Logo from '../ui/logo';
import AppLoadingOverlay from '../global/indicators/AppLoadingOverlay.jsx';

// Lazy load PasswordOnboarding component
const PasswordOnboarding = lazy(() => import('./passwordOnboarding'));

export default function LoginPage() {
  const notify = useNotifications();

  // Initialize form with useStandardForm (for login form)
  const { form, submitOperation, handleSubmit } = useStandardForm({
    initialValues: {
      username: '',
      password: '',
    },
    validate: {
      username: (value) => (!value ? 'Email or username is required' : null),
      password: (value) => (!value ? 'Password is required' : null),
    },
    resetOnSuccess: true,
  });

  // Separate operation for passkey login (not part of the form)
  const passkeyOperation = useAsyncOperation();

  // State for password onboarding flow
  const [showPasswordOnboarding, setShowPasswordOnboarding] = useState(false);
  const [passwordOnboardingUser, setPasswordOnboardingUser] = useState('');

  // Handle password manager autofill
  const handleAutofill = useCallback(() => {
    // Small delay to allow password managers to fill fields
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

  // Listen for autofill events using custom hooks
  useEventListener('DOMContentLoaded', handleAutofill, document);
  useEventListener('load', handleAutofill, window);

  // Check periodically for autofill for first 3 seconds
  const [stopPolling, setStopPolling] = useState(false);
  useInterval(handleAutofill, stopPolling ? null : 500, false);
  useTimeout(() => setStopPolling(true), 3000);

  const handleLogin = handleSubmit(async (values) => {
    // Determine if input is email or username
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
      if (result.error.message === 'REQUIRES_PASSWORD_CHANGE') {
        // Handle 428 - show password onboarding
        setShowPasswordOnboarding(true);
        setPasswordOnboardingUser(values.username);
        return;
      }
      throw new Error(result.error.message);
    }

    // Show success notification - Better Auth will handle the redirect automatically
    notify.success('Welcome back! You have been signed in successfully.');
    // Form reset is handled automatically by useStandardForm
  });

  const handlePasswordOnboardingSuccess = () => {
    setShowPasswordOnboarding(false);
    setPasswordOnboardingUser('');
    notify.success(
      'Password changed successfully! Welcome to the application.',
    );
    // Trigger auth refresh to update session
    window.dispatchEvent(new Event('auth-change'));
  };

  // Check WebAuthn support (pure derived state - no side effects needed)
  const isWebAuthnSupported = useMemo(() => {
    return !!(
      window.PublicKeyCredential &&
      window.navigator.credentials &&
      window.navigator.credentials.create &&
      window.navigator.credentials.get
    );
  }, []); // Expensive browser feature detection, properly memoized

  const handlePasskeyLogin = async () => {
    await passkeyOperation.execute(async () => {
      const result = await signInPasskey();

      // Better Auth may return result directly or in a different format
      if (result && result.error) {
        throw new Error(
          result.error.message || 'Passkey authentication failed',
        );
      }

      // Show success notification and trigger auth refresh
      notify.success('Welcome back! You have been signed in successfully.');

      // Force refresh session to update UI
      window.dispatchEvent(new Event('auth-change'));
    });
  };

  // Show password onboarding if required
  if (showPasswordOnboarding) {
    return (
      <Suspense
        fallback={<AppLoadingOverlay message="Loading password setup..." />}
      >
        <PasswordOnboarding
          username={passwordOnboardingUser}
          onSuccess={handlePasswordOnboardingSuccess}
        />
      </Suspense>
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
