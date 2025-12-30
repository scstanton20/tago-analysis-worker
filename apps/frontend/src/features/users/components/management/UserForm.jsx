import PropTypes from 'prop-types';
import { Stack, Group, Text, TextInput, Select } from '@mantine/core';
import {
  FormActionButtons,
  FormAlert,
  DepartmentPermissionsField,
} from '@/components/global';

/**
 * User Form Component
 * Handles both creating new users and editing existing users
 */
export default function UserForm({
  formState,
  editingUser,
  currentUser,
  isOwnerEditingSelf,
  availableTeams,
  availableActions,
  onSubmit,
  onCancel,
  onUsernameBlur,
}) {
  const { form, isDirty } = formState;

  return (
    <form onSubmit={form.onSubmit(onSubmit)}>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text fw={600} size="lg">
            {editingUser ? 'Edit User' : 'Create New User'}
          </Text>
        </Group>

        {editingUser && editingUser.id !== currentUser?.id && (
          <FormAlert color="blue" variant="light">
            <Text size="sm">
              As an admin, you can change this user's role and reset their
              password. The user must update their own name, email, and username
              through their profile settings.
            </Text>
          </FormAlert>
        )}

        {isOwnerEditingSelf && (
          <FormAlert color="orange" variant="light">
            <Text size="sm">
              This is the organization owner account. The owner role cannot be
              changed to maintain system security.
            </Text>
          </FormAlert>
        )}

        <TextInput
          label="Name"
          placeholder="Enter full name"
          required
          disabled={!!editingUser}
          description={
            editingUser
              ? 'User must update their own name through profile settings'
              : undefined
          }
          {...form.getInputProps('name')}
        />

        <TextInput
          label="Email"
          placeholder="Enter email address"
          required
          disabled={!!editingUser}
          description={
            editingUser
              ? 'User must update their own email through profile settings'
              : 'Must include @ and a valid domain (e.g., user@example.com)'
          }
          {...form.getInputProps('email')}
        />

        <TextInput
          label="Username (Optional)"
          placeholder="Enter username for login"
          description={
            editingUser
              ? 'User must update their own username through profile settings'
              : 'At least 3 characters, letters, numbers, hyphens, underscores, and dots only'
          }
          disabled={!!editingUser}
          {...form.getInputProps('username')}
          onBlur={(event) => onUsernameBlur(event.currentTarget.value)}
        />

        <Select
          label="Role"
          placeholder="Select role"
          required
          clearable={false}
          allowDeselect={false}
          disabled={isOwnerEditingSelf || editingUser?.id === currentUser?.id}
          description={
            editingUser?.id === currentUser?.id && !isOwnerEditingSelf
              ? 'You cannot change your own role'
              : undefined
          }
          data={
            isOwnerEditingSelf
              ? [
                  {
                    value: 'admin',
                    label: 'Administrator - Full system access',
                  },
                ]
              : [
                  {
                    value: 'user',
                    label: 'User - Specific department assignments',
                  },
                  {
                    value: 'admin',
                    label: 'Administrator - Full system access',
                  },
                ]
          }
          {...form.getInputProps('role')}
        />

        {form.values.role === 'admin' && (
          <FormAlert color="blue" variant="light">
            Administrators have full access to all features and can manage other
            users.
          </FormAlert>
        )}

        {form.values.role !== 'admin' &&
          editingUser?.id === currentUser?.id && (
            <FormAlert color="orange" variant="light">
              You cannot assign team permissions to yourself. Team assignments
              must be managed by another administrator.
            </FormAlert>
          )}

        {form.values.role !== 'admin' &&
          editingUser?.id !== currentUser?.id && (
            <DepartmentPermissionsField
              value={form.values.departmentPermissions}
              onChange={(value) =>
                form.setFieldValue('departmentPermissions', value)
              }
              error={form.errors.departmentPermissions}
              departments={availableTeams}
              permissions={availableActions}
            />
          )}

        <FormActionButtons
          onSubmit={onSubmit}
          onCancel={onCancel}
          submitLabel={editingUser ? 'Update User' : 'Create User'}
          disabled={!isDirty}
          submitType="submit"
          justify="flex-end"
          gap="sm"
        />
      </Stack>
    </form>
  );
}

UserForm.propTypes = {
  formState: PropTypes.object.isRequired,
  editingUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string,
  }),
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string,
  }),
  isOwnerEditingSelf: PropTypes.bool.isRequired,
  availableTeams: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  availableActions: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onUsernameBlur: PropTypes.func.isRequired,
};
