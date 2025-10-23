import PropTypes from 'prop-types';
import {
  Stack,
  Group,
  Text,
  Alert,
  TextInput,
  PasswordInput,
  Select,
  Button,
} from '@mantine/core';
import DepartmentPermissions from './DepartmentPermissions';

/**
 * User Form Component
 * Handles both creating new users and editing existing users
 */
export default function UserForm({
  form,
  editingUser,
  currentUser,
  isOnlyAdmin,
  isRootUser,
  availableTeams,
  availableActions,
  onSubmit,
  onCancel,
  onUsernameChange,
  onEmailChange,
  onToggleDepartment,
  onTogglePermission,
}) {
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
              : undefined
          }
          onChange={(event) => onEmailChange(event.currentTarget.value)}
          value={form.values.email}
          error={form.errors.email}
        />

        <TextInput
          label="Username (Optional)"
          placeholder="Enter username for login"
          description={
            editingUser
              ? 'User must update their own username through profile settings'
              : 'Users can login with either email or username'
          }
          disabled={!!editingUser}
          onChange={(event) => onUsernameChange(event.currentTarget.value)}
          value={form.values.username}
          error={form.errors.username}
        />

        {editingUser && (
          <PasswordInput
            label="New Password (leave blank to keep current)"
            placeholder="Enter password"
            {...form.getInputProps('password')}
          />
        )}

        <Select
          label="Role"
          placeholder="Select role"
          required
          clearable={false}
          allowDeselect={false}
          disabled={
            isRootUser ||
            (editingUser?.id === currentUser?.id &&
              editingUser?.role === 'admin' &&
              isOnlyAdmin)
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

        {form.values.role !== 'admin' && (
          <DepartmentPermissions
            availableTeams={availableTeams}
            availableActions={availableActions}
            departmentPermissions={form.values.departmentPermissions}
            onToggleDepartment={onToggleDepartment}
            onTogglePermission={onTogglePermission}
            error={form.errors.departmentPermissions}
          />
        )}

        {editingUser &&
          editingUser.id === currentUser?.id &&
          editingUser.role === 'admin' &&
          form.values.role !== 'admin' &&
          !isRootUser &&
          isOnlyAdmin && (
            <Alert color="orange" variant="light">
              Warning: There must be at least one administrator. Since you are
              the only admin, you cannot change your own role.
            </Alert>
          )}

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={onCancel}
            disabled={!form.isDirty()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gradient"
            gradient={{ from: 'brand.6', to: 'accent.6' }}
          >
            {editingUser ? 'Update User' : 'Create User'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

UserForm.propTypes = {
  form: PropTypes.shape({
    values: PropTypes.shape({
      name: PropTypes.string,
      email: PropTypes.string,
      username: PropTypes.string,
      password: PropTypes.string,
      role: PropTypes.string,
      departmentPermissions: PropTypes.object,
    }).isRequired,
    errors: PropTypes.object.isRequired,
    getInputProps: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    isDirty: PropTypes.func.isRequired,
  }).isRequired,
  editingUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string,
  }),
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string,
  }),
  isOnlyAdmin: PropTypes.bool.isRequired,
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
  onUsernameChange: PropTypes.func.isRequired,
  onEmailChange: PropTypes.func.isRequired,
  onToggleDepartment: PropTypes.func.isRequired,
  onTogglePermission: PropTypes.func.isRequired,
};
