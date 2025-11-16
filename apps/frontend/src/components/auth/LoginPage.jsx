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
import { useAsyncOperation } from '../../hooks/async/useAsyncOperation';
import Logo from '../ui/logo';
import AppLoadingOverlay from '../global/indicators/AppLoadingOverlay.jsx';

// Lazy load PasswordOnboarding component
const PasswordOnboarding = lazy(() => import('./passwordOnboarding'));

export default function LoginPage() {
  const notify = useNotifications();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const loginOperation = useAsyncOperation();
  const passkeyOperation = useAsyncOperation();
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
        usernameInput.value !== formData.username
      ) {
        setFormData((prev) => ({ ...prev, username: usernameInput.value }));
      }
      if (
        passwordInput &&
        passwordInput.value &&
        passwordInput.value !== formData.password
      ) {
        setFormData((prev) => ({ ...prev, password: passwordInput.value }));
      }
    }, 100);
  }, [formData.username, formData.password]);

  // Listen for autofill events using custom hooks
  useEventListener('DOMContentLoaded', handleAutofill, document);
  useEventListener('load', handleAutofill, window);

  // Check periodically for autofill for first 3 seconds
  const [stopPolling, setStopPolling] = useState(false);
  useInterval(handleAutofill, stopPolling ? null : 500, false);
  useTimeout(() => setStopPolling(true), 3000);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      loginOperation.setError('Please fill in all fields');
      return;
    }

    await loginOperation.execute(async () => {
      // Determine if input is email or username
      const isEmail = formData.username.includes('@');

      let result;
      if (isEmail) {
        result = await signIn.email({
          email: formData.username,
          password: formData.password,
        });
      } else {
        result = await signIn.username({
          username: formData.username,
          password: formData.password,
        });
      }

      if (result.error) {
        if (result.error.message === 'REQUIRES_PASSWORD_CHANGE') {
          // Handle 428 - show password onboarding
          setShowPasswordOnboarding(true);
          setPasswordOnboardingUser(formData.username);
          return;
        }
        throw new Error(result.error.message);
      }

      // Show success notification - Better Auth will handle the redirect automatically
      notify.success('Welcome back! You have been signed in successfully.');
    });
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (loginOperation.error) loginOperation.setError('');
  };

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
          <form onSubmit={handleSubmit}>
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
                message={loginOperation.error || passkeyOperation.error}
              />

              <Stack gap="md" key="login-form-fields">
                <TextInput
                  label="Email or Username"
                  placeholder="Enter your email or username"
                  value={formData.username}
                  onChange={(e) =>
                    handleInputChange('username', e.target.value)
                  }
                  required
                  size="md"
                  autoComplete="username"
                  name="username"
                  id="username"
                  description="You can sign in with either your email address or username"
                />

                <PasswordInput
                  label="Password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) =>
                    handleInputChange('password', e.target.value)
                  }
                  required
                  size="md"
                  autoComplete="current-password"
                  name="password"
                  id="password"
                />
              </Stack>

              <PrimaryButton
                type="submit"
                loading={loginOperation.loading}
                fullWidth
                size="md"
                leftSection={<IconLogin size="1rem" />}
                radius="md"
                style={{
                  fontWeight: 600,
                }}
                disabled={passkeyOperation.loading}
              >
                {loginOperation.loading ? 'Signing in...' : 'Sign In'}
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
                    disabled={loginOperation.loading}
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
