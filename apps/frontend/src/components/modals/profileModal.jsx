import { useState, useEffect } from 'react';
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
  Tabs,
  TextInput,
  ActionIcon,
  Badge,
  Paper,
  Center,
  Loader,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconUser,
  IconAlertCircle,
  IconCheck,
  IconKey,
  IconShield,
  IconPlus,
  IconTrash,
  IconFingerprint,
} from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
import { webauthnService } from '../../services/webauthnService';

export default function ProfileModal({ opened, onClose }) {
  const { user, changePassword, updateProfile } = useAuth();

  // Password change state
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Profile editing state
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Passkey state
  const [passkeys, setPasskeys] = useState([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeysError, setPasskeysError] = useState('');
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const passwordForm = useForm({
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

  const passkeyForm = useForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (!value ? 'Passkey name is required' : null),
    },
  });

  const profileForm = useForm({
    initialValues: {
      username: user?.username || '',
      email: user?.email || '',
    },
    validate: {
      username: (value) => (!value ? 'Username is required' : null),
      email: (value) => {
        if (!value) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return !emailRegex.test(value) ? 'Invalid email format' : null;
      },
    },
  });

  // Update form when user changes
  useEffect(() => {
    if (user) {
      profileForm.setValues({
        username: user.username || '',
        email: user.email || '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load WebAuthn support and passkeys on modal open
  useEffect(() => {
    if (opened) {
      checkWebAuthnSupport();
      loadPasskeys();
    }
  }, [opened]);

  const checkWebAuthnSupport = async () => {
    const supported = webauthnService.isSupported();
    setIsWebAuthnSupported(supported);
  };

  const loadPasskeys = async () => {
    try {
      setPasskeysLoading(true);
      setPasskeysError('');
      const authenticators = await webauthnService.getAuthenticators();
      setPasskeys(authenticators);
    } catch (error) {
      setPasskeysError(error.message || 'Failed to load passkeys');
    } finally {
      setPasskeysLoading(false);
    }
  };

  const handlePasswordSubmit = async (values) => {
    try {
      setPasswordLoading(true);
      setPasswordError('');
      setPasswordSuccess(false);

      await changePassword(values.currentPassword, values.newPassword);

      setPasswordSuccess(true);
      passwordForm.reset();

      // Auto-close after success
      setTimeout(() => {
        setPasswordSuccess(false);
        if (activeTab === 'password') {
          onClose();
        }
      }, 2000);
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleProfileSubmit = async (values) => {
    try {
      setProfileLoading(true);
      setProfileError('');
      setProfileSuccess(false);

      await updateProfile(values.username, values.email);

      setProfileSuccess(true);
      setIsEditingProfile(false);

      // Auto-clear success message
      setTimeout(() => {
        setProfileSuccess(false);
      }, 3000);
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCancelProfileEdit = () => {
    setIsEditingProfile(false);
    setProfileError('');
    setProfileSuccess(false);
    profileForm.setValues({
      username: user?.username || '',
      email: user?.email || '',
    });
  };

  const handleRegisterPasskey = async (values) => {
    try {
      setRegisteringPasskey(true);
      setPasskeysError('');

      await webauthnService.registerPasskey(values.name);

      // Reload passkeys list
      await loadPasskeys();
      passkeyForm.reset();

      // Switch to passkeys tab to show the new passkey
      setActiveTab('passkeys');
    } catch (error) {
      setPasskeysError(error.message || 'Failed to register passkey');
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (credentialId) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this passkey? You may lose access to your account if this is your only authentication method.',
      )
    ) {
      return;
    }

    try {
      setPasskeysError('');
      await webauthnService.deleteAuthenticator(credentialId);
      await loadPasskeys();
    } catch (error) {
      setPasskeysError(error.message || 'Failed to delete passkey');
    }
  };

  const handleClose = () => {
    passwordForm.reset();
    passkeyForm.reset();
    setPasswordError('');
    setPasswordSuccess(false);
    setPasskeysError('');
    setActiveTab('profile');
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
      size="lg"
      centered
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="profile" leftSection={<IconUser size={16} />}>
            Profile
          </Tabs.Tab>
          <Tabs.Tab value="password" leftSection={<IconKey size={16} />}>
            Password
          </Tabs.Tab>
          <Tabs.Tab value="passkeys" leftSection={<IconShield size={16} />}>
            Passkeys
            {isWebAuthnSupported && passkeys.length > 0 && (
              <Badge size="xs" ml="xs" variant="filled">
                {passkeys.length}
              </Badge>
            )}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="profile" pt="md">
          <Stack gap="md">
            {profileError && (
              <Alert
                icon={<IconAlertCircle size="1rem" />}
                color="red"
                variant="light"
              >
                {profileError}
              </Alert>
            )}

            {profileSuccess && (
              <Alert
                icon={<IconCheck size="1rem" />}
                color="green"
                variant="light"
              >
                Profile updated successfully!
              </Alert>
            )}

            {!isEditingProfile ? (
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
                <Group justify="flex-end" mt="md">
                  <Button
                    variant="light"
                    size="sm"
                    onClick={() => setIsEditingProfile(true)}
                  >
                    Edit Profile
                  </Button>
                </Group>
              </Box>
            ) : (
              <form onSubmit={profileForm.onSubmit(handleProfileSubmit)}>
                <Stack gap="md">
                  <TextInput
                    label="Username"
                    placeholder="Enter your username"
                    required
                    autoComplete="username"
                    {...profileForm.getInputProps('username')}
                  />

                  <TextInput
                    label="Email"
                    placeholder="Enter your email"
                    type="email"
                    required
                    autoComplete="email"
                    {...profileForm.getInputProps('email')}
                  />

                  <Box
                    p="sm"
                    style={{
                      borderRadius: 'var(--mantine-radius-md)',
                    }}
                  >
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>
                        Role:
                      </Text>
                      <Text size="sm" transform="capitalize">
                        {user?.role}
                      </Text>
                    </Group>
                  </Box>

                  <Group justify="flex-end" gap="sm" mt="md">
                    <Button
                      variant="default"
                      onClick={handleCancelProfileEdit}
                      disabled={profileLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      loading={profileLoading}
                      variant="gradient"
                    >
                      Save Changes
                    </Button>
                  </Group>
                </Stack>
              </form>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="password" pt="md">
          <form onSubmit={passwordForm.onSubmit(handlePasswordSubmit)}>
            <Stack gap="md">
              {passwordError && (
                <Alert
                  icon={<IconAlertCircle size="1rem" />}
                  color="red"
                  variant="light"
                >
                  {passwordError}
                </Alert>
              )}

              {passwordSuccess && (
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
                {...passwordForm.getInputProps('currentPassword')}
              />

              <PasswordInput
                label="New Password"
                placeholder="Enter new password (min 6 characters)"
                required
                {...passwordForm.getInputProps('newPassword')}
              />

              <PasswordInput
                label="Confirm New Password"
                placeholder="Confirm your new password"
                required
                {...passwordForm.getInputProps('confirmPassword')}
              />

              <Group justify="flex-end" gap="sm" mt="md">
                <Button
                  variant="default"
                  onClick={handleClose}
                  disabled={passwordLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={passwordLoading}
                  disabled={passwordSuccess}
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                >
                  Change Password
                </Button>
              </Group>
            </Stack>
          </form>
        </Tabs.Panel>

        <Tabs.Panel value="passkeys" pt="md">
          <Stack gap="md">
            {!isWebAuthnSupported && (
              <Alert
                icon={<IconAlertCircle size="1rem" />}
                color="orange"
                variant="light"
              >
                WebAuthn is not supported in this browser. Passkeys require a
                modern browser with WebAuthn support.
              </Alert>
            )}

            {isWebAuthnSupported && (
              <>
                {/* Register New Passkey */}
                <Paper p="md" withBorder>
                  <form onSubmit={passkeyForm.onSubmit(handleRegisterPasskey)}>
                    <Stack gap="md">
                      <Group gap="xs">
                        <IconFingerprint size={20} />
                        <Text fw={500}>Register New Passkey</Text>
                      </Group>

                      <Text size="sm" c="dimmed">
                        Add a new passkey to your account. You can use Face ID,
                        Touch ID, Windows Hello, or a security key.
                      </Text>

                      <TextInput
                        label="Passkey Name"
                        placeholder="e.g., iPhone Face ID, YubiKey, etc."
                        required
                        {...passkeyForm.getInputProps('name')}
                      />

                      <Group justify="flex-end">
                        <Button
                          type="submit"
                          loading={registeringPasskey}
                          leftSection={<IconPlus size={16} />}
                          variant="gradient"
                          gradient={{ from: 'brand.6', to: 'accent.6' }}
                        >
                          Register Passkey
                        </Button>
                      </Group>
                    </Stack>
                  </form>
                </Paper>

                {/* Passkey Errors */}
                {passkeysError && (
                  <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    color="red"
                    variant="light"
                  >
                    {passkeysError}
                  </Alert>
                )}

                {/* Registered Passkeys List */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Group gap="xs">
                      <IconShield size={20} />
                      <Text fw={500}>Your Passkeys</Text>
                      {passkeysLoading && <Loader size="sm" />}
                    </Group>

                    {passkeysLoading ? (
                      <Center p="xl">
                        <Loader size="md" />
                      </Center>
                    ) : passkeys.length === 0 ? (
                      <Text size="sm" c="dimmed" ta="center" p="xl">
                        No passkeys registered. Register your first passkey
                        above to enable secure, passwordless authentication.
                      </Text>
                    ) : (
                      <Stack gap="xs">
                        {passkeys.map((passkey, index) => (
                          <Paper
                            key={passkey.id || passkey.credentialID || index}
                            p="sm"
                            withBorder
                          >
                            <Group justify="space-between" align="center">
                              <Stack gap={4}>
                                <Group gap="xs">
                                  <IconFingerprint size={16} />
                                  <Text fw={500} size="sm">
                                    {passkey.name || 'Unnamed Passkey'}
                                  </Text>
                                </Group>
                                <Group gap="xs">
                                  <Badge size="xs" variant="light">
                                    {webauthnService.getAuthenticatorTypeName(
                                      passkey.transports,
                                    )}
                                  </Badge>
                                  <Text size="xs" c="dimmed">
                                    Added{' '}
                                    {new Date(
                                      passkey.createdAt,
                                    ).toLocaleDateString()}
                                  </Text>
                                </Group>
                              </Stack>
                              <ActionIcon
                                color="red"
                                variant="light"
                                size="sm"
                                onClick={() => handleDeletePasskey(passkey.id)}
                                title="Delete passkey"
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              </>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

ProfileModal.propTypes = {
  opened: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
