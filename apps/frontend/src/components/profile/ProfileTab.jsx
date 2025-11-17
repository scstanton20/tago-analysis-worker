/**
 * Profile tab component for profile modal
 * Displays and allows editing of user profile information
 * @module components/profile/ProfileTab
 */

import PropTypes from 'prop-types';
import { Stack, Group, Text, Box, TextInput } from '@mantine/core';
import {
  FormAlert,
  FormActionButtons,
  ContentBox,
  SecondaryButton,
} from '../global';

export function ProfileTab({
  user,
  profileFormState,
  profileError,
  profileSuccess,
  profileLoading,
  isEditingProfile,
  setIsEditingProfile,
  handleProfileSubmit,
  handleCancelProfileEdit,
}) {
  const { form, isDirty } = profileFormState;
  return (
    <Stack gap="md">
      <FormAlert type="error" message={profileError} />
      <FormAlert
        type="success"
        message={profileSuccess ? 'Profile updated successfully!' : null}
      />

      {!isEditingProfile ? (
        <ContentBox>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Name:
              </Text>
              <Text size="sm">{user.name}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Username:
              </Text>
              <Text size="sm">{user.username}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Email:
              </Text>
              <Text size="sm">{user.email}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Role:
              </Text>
              <Text size="sm" transform="capitalize">
                {user.role}
              </Text>
            </Group>
          </Stack>
          <Group justify="flex-end" mt="md">
            <SecondaryButton
              size="sm"
              onClick={() => setIsEditingProfile(true)}
            >
              Edit Profile
            </SecondaryButton>
          </Group>
        </ContentBox>
      ) : (
        <form onSubmit={form.onSubmit(handleProfileSubmit)}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="Enter your name"
              required
              autoComplete="name"
              {...form.getInputProps('name')}
            />

            <TextInput
              label="Username"
              placeholder="Enter your username"
              required
              autoComplete="username"
              {...form.getInputProps('username')}
            />

            <TextInput
              label="Email"
              placeholder="Enter your email"
              type="email"
              required
              autoComplete="email"
              {...form.getInputProps('email')}
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
                  {user.role}
                </Text>
              </Group>
            </Box>

            <FormActionButtons
              onSubmit={handleProfileSubmit}
              onCancel={handleCancelProfileEdit}
              loading={profileLoading}
              disabled={!isDirty}
              submitLabel="Save Changes"
            />
          </Stack>
        </form>
      )}
    </Stack>
  );
}

ProfileTab.propTypes = {
  user: PropTypes.shape({
    name: PropTypes.string,
    username: PropTypes.string,
    email: PropTypes.string,
    role: PropTypes.string,
  }).isRequired,
  profileFormState: PropTypes.object.isRequired,
  profileError: PropTypes.string,
  profileSuccess: PropTypes.bool,
  profileLoading: PropTypes.bool,
  isEditingProfile: PropTypes.bool,
  setIsEditingProfile: PropTypes.func.isRequired,
  handleProfileSubmit: PropTypes.func.isRequired,
  handleCancelProfileEdit: PropTypes.func.isRequired,
};
