/**
 * Profile modal content component
 * Manages user profile settings, password changes, and passkey management
 * @module modals/components/ProfileModalContent
 */

import { useEffect } from 'react';
import { Group, Text, Tabs, Badge, Stack } from '@mantine/core';
import { IconUser, IconKey, IconShield } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { useProfileModal } from '../../hooks/useProfileModal';
import { ProfileTab } from '../../components/profile/ProfileTab';
import { PasswordTab } from '../../components/profile/PasswordTab';
import { PasskeysTab } from '../../components/profile/PasskeysTab';
import PropTypes from 'prop-types';

/**
 * ProfileModalContent
 * Content component for profile settings modal
 *
 * @param {Object} props - Component props
 * @param {Object} props.context - Mantine modal context
 * @param {string} props.id - Modal ID
 * @param {Object} props.innerProps - Modal inner props (unused, but required)
 * @returns {JSX.Element} Modal content
 */
function ProfileModalContent({ context, id }) {
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
    loadData,
  } = useProfileModal({
    closeModal: () => modals.close(id),
  });

  // Load data when component mounts (modal opens)
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Update modal title with user icon
  useEffect(() => {
    context.updateModal({
      title: (
        <Group gap="xs">
          <IconUser size={20} aria-hidden="true" />
          <Text fw={600}>Profile Settings</Text>
        </Group>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Set once on mount

  return (
    <Stack>
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
    </Stack>
  );
}

ProfileModalContent.propTypes = {
  context: PropTypes.object.isRequired,
  id: PropTypes.string.isRequired,
};

export default ProfileModalContent;
