/**
 * Profile modal component
 * Manages user profile settings, password changes, and passkey management
 * @module components/modals/profileModal
 */

import PropTypes from 'prop-types';
import { Modal, Group, Text, Tabs, Badge } from '@mantine/core';
import { IconUser, IconKey, IconShield } from '@tabler/icons-react';
import { useProfileModal } from '../../hooks/useProfileModal';
import { ProfileTab } from '../profile/ProfileTab';
import { PasswordTab } from '../profile/PasswordTab';
import { PasskeysTab } from '../profile/PasskeysTab';

export default function ProfileModal({ opened, onClose }) {
  const {
    activeTab,
    setActiveTab,
    user,
    passwordLoading,
    passwordError,
    passwordSuccess,
    passwordForm,
    handlePasswordSubmit,
    profileLoading,
    profileError,
    profileSuccess,
    isEditingProfile,
    setIsEditingProfile,
    profileForm,
    handleProfileSubmit,
    handleCancelProfileEdit,
    passkeys,
    passkeysLoading,
    passkeysError,
    registeringPasskey,
    isWebAuthnSupported,
    passkeyForm,
    handleRegisterPasskey,
    handleDeletePasskey,
    handleClose,
  } = useProfileModal({ opened, onClose });

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <IconUser size={20} aria-hidden="true" />
          <Text fw={600} id="profile-modal-title">
            Profile Settings
          </Text>
        </Group>
      }
      size="lg"
      centered
      aria-labelledby="profile-modal-title"
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
          <ProfileTab
            user={user}
            profileForm={profileForm}
            profileError={profileError}
            profileSuccess={profileSuccess}
            profileLoading={profileLoading}
            isEditingProfile={isEditingProfile}
            setIsEditingProfile={setIsEditingProfile}
            handleProfileSubmit={handleProfileSubmit}
            handleCancelProfileEdit={handleCancelProfileEdit}
          />
        </Tabs.Panel>

        <Tabs.Panel value="password" pt="md">
          <PasswordTab
            passwordForm={passwordForm}
            passwordError={passwordError}
            passwordLoading={passwordLoading}
            passwordSuccess={passwordSuccess}
            handlePasswordSubmit={handlePasswordSubmit}
            handleClose={handleClose}
          />
        </Tabs.Panel>

        <Tabs.Panel value="passkeys" pt="md">
          <PasskeysTab
            isWebAuthnSupported={isWebAuthnSupported}
            passkeyForm={passkeyForm}
            registeringPasskey={registeringPasskey}
            passkeysError={passkeysError}
            passkeysLoading={passkeysLoading}
            passkeys={passkeys}
            handleRegisterPasskey={handleRegisterPasskey}
            handleDeletePasskey={handleDeletePasskey}
          />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

ProfileModal.propTypes = {
  opened: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
