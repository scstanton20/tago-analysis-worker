/**
 * Password tab component for profile modal
 * Handles password change functionality
 * @module components/profile/PasswordTab
 */

import PropTypes from 'prop-types';
import { Stack, PasswordInput } from '@mantine/core';
import { FormAlert, FormActionButtons } from '../global';

export function PasswordTab({
  passwordFormState,
  passwordError,
  passwordLoading,
  passwordSuccess,
  handlePasswordSubmit,
  handleClose,
}) {
  const { form, isDirty } = passwordFormState;

  return (
    <form onSubmit={form.onSubmit(handlePasswordSubmit)}>
      <Stack gap="md">
        <FormAlert type="error" message={passwordError} />

        <PasswordInput
          label="Current Password"
          placeholder="Enter your current password"
          required
          autoComplete="current-password"
          name="current-password"
          id="profile-current-password"
          {...form.getInputProps('currentPassword')}
        />

        <PasswordInput
          label="New Password"
          placeholder="Min 6 characters, must include uppercase"
          required
          autoComplete="new-password"
          name="new-password"
          id="profile-new-password"
          {...form.getInputProps('newPassword')}
        />

        <PasswordInput
          label="Confirm New Password"
          placeholder="Confirm your new password"
          required
          autoComplete="new-password"
          name="confirm-password"
          id="profile-confirm-password"
          {...form.getInputProps('confirmPassword')}
        />

        <FormActionButtons
          onSubmit={handlePasswordSubmit}
          onCancel={handleClose}
          loading={passwordLoading}
          disabled={passwordSuccess || !isDirty || !form.isValid()}
          submitLabel="Change Password"
        />
      </Stack>
    </form>
  );
}

PasswordTab.propTypes = {
  passwordFormState: PropTypes.object.isRequired,
  passwordError: PropTypes.string,
  passwordLoading: PropTypes.bool,
  passwordSuccess: PropTypes.bool,
  handlePasswordSubmit: PropTypes.func.isRequired,
  handleClose: PropTypes.func.isRequired,
};
