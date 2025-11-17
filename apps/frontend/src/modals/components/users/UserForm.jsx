import PropTypes from 'prop-types';
import {
  Stack,
  Group,
  Text,
  // eslint-disable-next-line no-restricted-imports -- Special case: conditional informational alerts with embedded Text components
  Alert,
  TextInput,
  PasswordInput,
  Select,
} from '@mantine/core';
import { FormActionButtons } from '../../../components/global';
import DepartmentPermissions from './DepartmentPermissions';

/**
 * User Form Component
 * Handles both creating new users and editing existing users
 */
export default function UserForm({
  formState,
  editingUser,
  currentUser,
  isRootUser,
  availableTeams,
  availableActions,
  onSubmit,
  onCancel,
  onUsernameBlur,
  onToggleDepartment,
  onTogglePermission,
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
          <Alert color="blue" variant="light">
            <Text size="sm">
              As an admin, you can change this user's role and reset their
              password. The user must update their own name, email, and username
              through their profile settings.
            </Text>
          </Alert>
        )}

        {isRootUser && (
          <Alert color="orange" variant="light">
            <Text size="sm">
              This is the root administrator account. The administrator role
              cannot be changed to maintain system security.
            </Text>
          </Alert>
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
          disabled={isRootUser || editingUser?.id === currentUser?.id}
          description={
            editingUser?.id === currentUser?.id && !isRootUser
              ? 'You cannot change your own role'
              : undefined
          }
          data={
            isRootUser
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
          <Alert color="blue" variant="light">
            Administrators have full access to all features and can manage other
            users.
          </Alert>
        )}

        {form.values.role !== 'admin' &&
          editingUser?.id === currentUser?.id && (
            <Alert color="orange" variant="light">
              You cannot assign team permissions to yourself. Team assignments
              must be managed by another administrator.
            </Alert>
          )}

        {form.values.role !== 'admin' &&
          editingUser?.id !== currentUser?.id && (
            <DepartmentPermissions
              availableTeams={availableTeams}
              availableActions={availableActions}
              departmentPermissions={form.values.departmentPermissions}
              onToggleDepartment={onToggleDepartment}
              onTogglePermission={onTogglePermission}
              error={form.errors.departmentPermissions}
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
  isRootUser: PropTypes.bool.isRequired,
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
  onToggleDepartment: PropTypes.func.isRequired,
  onTogglePermission: PropTypes.func.isRequired,
};
