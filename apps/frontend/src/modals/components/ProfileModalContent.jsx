/**
 * Profile modal content component
 * Manages user profile settings, password changes, and passkey management
 * @module modals/components/ProfileModalContent
 */

import { lazy, Suspense } from 'react';
import { Tabs, Badge, Stack } from '@mantine/core';
import {
  IconKey,
  IconShield,
  IconUser as TabIconUser,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { useProfileModal } from '../../hooks/useProfileModal';
import { LoadingState } from '../../components/global';
import { useAsyncMountOnce } from '../../hooks/async';
const ProfileTab = lazy(() =>
  import('../../components/profile/ProfileTab').then((m) => ({
    default: m.ProfileTab,
  })),
);
const PasswordTab = lazy(() =>
  import('../../components/profile/PasswordTab').then((m) => ({
    default: m.PasswordTab,
  })),
);
const PasskeysTab = lazy(() =>
  import('../../components/profile/PasskeysTab').then((m) => ({
    default: m.PasskeysTab,
  })),
);
import PropTypes from 'prop-types';

/**
 * ProfileModalContent
 * Content component for profile settings modal
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Modal ID
 * @param {Object} props.innerProps - Modal inner props (unused, but required)
 * @returns {JSX.Element} Modal content
 */
function ProfileModalContent({ id }) {
  const {
    activeTab,
    setActiveTab,
    user,
    passwordLoading,
    passwordError,
    passwordSuccess,
    passwordFormState,
    handlePasswordSubmit,
    profileLoading,
    profileError,
    profileSuccess,
    isEditingProfile,
    setIsEditingProfile,
    profileFormState,
    handleProfileSubmit,
    handleCancelProfileEdit,
    passkeys,
    passkeysLoading,
    passkeysError,
    registeringPasskey,
    isWebAuthnSupported,
    passkeyFormState,
    handleRegisterPasskey,
    handleDeletePasskey,
    handleClose,
    loadData,
  } = useProfileModal({
    closeModal: () => modals.close(id),
  });

  // Load data when component mounts (modal opens)
  useAsyncMountOnce(async () => {
    await loadData();
  });

  return (
    <Suspense
      fallback={
        <LoadingState
          loading={true}
          skeleton
          pattern="form"
          skeletonCount={4}
        />
      }
    >
      <Stack>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="profile" leftSection={<TabIconUser size={16} />}>
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
              profileFormState={profileFormState}
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
              passwordFormState={passwordFormState}
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
              passkeyFormState={passkeyFormState}
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
    </Suspense>
  );
}

ProfileModalContent.propTypes = {
  id: PropTypes.string.isRequired,
};

export default ProfileModalContent;
