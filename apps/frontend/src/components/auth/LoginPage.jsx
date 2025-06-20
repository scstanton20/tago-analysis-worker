import { useState, useEffect } from 'react';
import {
  TextInput,
  PasswordInput,
  Button,
  Title,
  Text,
  Box,
  Stack,
  Alert,
  Container,
  Card,
  Divider,
  Group,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconLogin,
  IconFingerprint,
} from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
import { webauthnService } from '../../services/webauthnService';
import Logo from '../logo';
import ForcePasswordChange from './ForcePasswordChange';

export default function LoginPage() {
  const { login, loginWithPasskey } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(null);
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(formData.username, formData.password);
    } catch (err) {
      if (err.mustChangePassword) {
        setPasswordChangeRequired(err.user);
        setError('');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  // Check WebAuthn support on component mount
  useEffect(() => {
    const checkSupport = async () => {
      const supported = webauthnService.isSupported();
      setIsWebAuthnSupported(supported);
    };
    checkSupport();
  }, []);

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    setError('');

    try {
      // Try usernameless authentication first
      const result = await webauthnService.authenticateUsernameless();

      if (result.success) {
        // Tokens are now in httpOnly cookies, just pass the user data
        await loginWithPasskey(result.user);
      } else {
        throw new Error('Authentication failed');
      }
    } catch (err) {
      // If usernameless fails and we have a username, try username-based auth
      if (formData.username && err.message.includes('usernameless')) {
        try {
          const result = await webauthnService.authenticateWithUsername(
            formData.username,
          );
          if (result.success) {
            await loginWithPasskey(result.user);
          } else {
            throw new Error('Authentication failed');
          }
        } catch (usernameErr) {
          setError(usernameErr.message || 'Passkey authentication failed');
        }
      } else {
        setError(err.message || 'Passkey authentication failed');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // Show password change component if required
  if (passwordChangeRequired) {
    return (
      <ForcePasswordChange
        username={passwordChangeRequired.username}
        onSuccess={() => window.location.reload()}
      />
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
                  Tago Analysis Runner
                </Title>
                <Text size="sm" c="dimmed" ta="center">
                  Sign in to your account
                </Text>
              </Box>

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
                <TextInput
                  label="Username"
                  placeholder="Enter your username"
                  value={formData.username}
                  onChange={(e) =>
                    handleInputChange('username', e.target.value)
                  }
                  required
                  size="md"
                  autoComplete="username"
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
                />
              </Stack>

              <Button
                type="submit"
                loading={loading}
                fullWidth
                size="md"
                leftSection={<IconLogin size="1rem" />}
                variant="gradient"
                gradient={{ from: 'brand.6', to: 'accent.6' }}
                radius="md"
                style={{
                  fontWeight: 600,
                }}
                disabled={passkeyLoading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>

              {isWebAuthnSupported && (
                <>
                  <Divider label="OR" labelPosition="center" />

                  <Button
                    onClick={handlePasskeyLogin}
                    loading={passkeyLoading}
                    fullWidth
                    size="md"
                    leftSection={<IconFingerprint size="1rem" />}
                    variant="light"
                    color="blue"
                    radius="md"
                    style={{
                      fontWeight: 600,
                    }}
                    disabled={loading}
                  >
                    {passkeyLoading
                      ? 'Authenticating...'
                      : 'Sign in with Passkey'}
                  </Button>

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
