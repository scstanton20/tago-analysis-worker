/**
 * Password tab component for profile modal
 * Handles password change functionality
 * @module components/profile/PasswordTab
 */

import PropTypes from 'prop-types';
import { Stack, Group, Button, PasswordInput, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

export function PasswordTab({
  passwordForm,
  passwordError,
  passwordLoading,
  passwordSuccess,
  handlePasswordSubmit,
  handleClose,
}) {
  return (
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

        <PasswordInput
          label="Current Password"
          placeholder="Enter your current password"
          required
          autoComplete="current-password"
          name="current-password"
          id="profile-current-password"
          {...passwordForm.getInputProps('currentPassword')}
        />

        <PasswordInput
          label="New Password"
          placeholder="Min 6 characters, must include uppercase"
          required
          autoComplete="new-password"
          name="new-password"
          id="profile-new-password"
          {...passwordForm.getInputProps('newPassword')}
        />

        <PasswordInput
          label="Confirm New Password"
          placeholder="Confirm your new password"
          required
          autoComplete="new-password"
          name="confirm-password"
          id="profile-confirm-password"
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
  );
}

PasswordTab.propTypes = {
  passwordForm: PropTypes.object.isRequired,
  passwordError: PropTypes.string,
  passwordLoading: PropTypes.bool,
  passwordSuccess: PropTypes.bool,
  handlePasswordSubmit: PropTypes.func.isRequired,
  handleClose: PropTypes.func.isRequired,
};
