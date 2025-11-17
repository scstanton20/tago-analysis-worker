/**
 * Passkeys tab component for profile modal
 * Handles passkey registration and management
 * @module components/profile/PasskeysTab
 */

import PropTypes from 'prop-types';
import {
  Stack,
  Group,
  Text,
  Paper,
  Center,
  Loader,
  TextInput,
  ActionIcon,
  Badge,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconFingerprint,
  IconShield,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { FormAlert, PaperCard, FormActionButtons } from '../global';

export function PasskeysTab({
  isWebAuthnSupported,
  passkeyFormState,
  registeringPasskey,
  passkeysError,
  passkeysLoading,
  passkeys,
  handleRegisterPasskey,
  handleDeletePasskey,
}) {
  const { form, isDirty } = passkeyFormState;
  const confirmDeletePasskey = (credentialId) => {
    modals.openConfirmModal({
      title: 'Delete Passkey',
      children:
        'Are you sure you want to delete this passkey? You may lose access to your account if this is your only authentication method.',
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => handleDeletePasskey(credentialId),
    });
  };

  return (
    <Stack gap="md">
      <FormAlert
        type="warning"
        message={
          !isWebAuthnSupported
            ? 'WebAuthn is not supported in this browser. Passkeys require a modern browser with WebAuthn support.'
            : null
        }
      />

      {isWebAuthnSupported && (
        <>
          {/* Register New Passkey */}
          <PaperCard
            title="Register New Passkey"
            icon={<IconFingerprint size={20} />}
          >
            <form onSubmit={form.onSubmit(handleRegisterPasskey)}>
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  Add a new passkey to your account. You can use Face ID, Touch
                  ID, Windows Hello, or a security key.
                </Text>

                <TextInput
                  label="Passkey Name"
                  placeholder="e.g., iPhone Face ID, YubiKey, etc."
                  required
                  {...form.getInputProps('name')}
                />

                <FormActionButtons
                  loading={registeringPasskey}
                  disabled={!isDirty}
                  submitLabel="Register Passkey"
                  submitIcon={<IconPlus size={16} />}
                  singleButton
                />
              </Stack>
            </form>
          </PaperCard>

          {/* Passkey Errors */}
          <FormAlert type="error" message={passkeysError} />

          {/* Registered Passkeys List */}
          <PaperCard
            title="Your Passkeys"
            icon={<IconShield size={20} />}
            actions={passkeysLoading && <Loader size="sm" />}
          >
            {passkeysLoading ? (
              <Center p="xl">
                <Loader size="md" />
              </Center>
            ) : passkeys.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" p="xl">
                No passkeys registered. Register your first passkey above to
                enable secure, passwordless authentication.
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
                            {Array.isArray(passkey.transports)
                              ? passkey.transports.join(', ')
                              : 'Passkey'}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            Added{' '}
                            {new Date(passkey.createdAt).toLocaleDateString()}
                          </Text>
                        </Group>
                      </Stack>
                      <ActionIcon
                        color="red"
                        variant="light"
                        size="sm"
                        onClick={() => confirmDeletePasskey(passkey.id)}
                        aria-label={`Delete ${passkey.name || 'passkey'}`}
                        title="Delete passkey"
                      >
                        <IconTrash size={14} aria-hidden="true" />
                      </ActionIcon>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </PaperCard>
        </>
      )}
    </Stack>
  );
}

PasskeysTab.propTypes = {
  isWebAuthnSupported: PropTypes.bool,
  passkeyFormState: PropTypes.object.isRequired,
  registeringPasskey: PropTypes.bool,
  passkeysError: PropTypes.string,
  passkeysLoading: PropTypes.bool,
  passkeys: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      credentialID: PropTypes.string,
      name: PropTypes.string,
      transports: PropTypes.arrayOf(PropTypes.string),
      createdAt: PropTypes.string,
    }),
  ),
  handleRegisterPasskey: PropTypes.func.isRequired,
  handleDeletePasskey: PropTypes.func.isRequired,
};
