/**
 * Department Permissions Field - Reusable form field component
 * Compatible with Mantine form API for team/department permission management
 * @module components/global/DepartmentPermissionsField
 */

import PropTypes from 'prop-types';
import {
  Stack,
  Group,
  Text,
  Paper,
  Badge,
  Box,
  Checkbox,
  Divider,
} from '@mantine/core';
import { FormAlert } from '../global';

/**
 * DepartmentPermissionsField Component
 * Reusable form field for managing department access and permissions
 *
 * @param {Object} props - Component props
 * @param {Object} props.value - Department permissions object (form field value)
 * @param {Function} props.onChange - Change handler (receives updated permissions object)
 * @param {string} props.error - Error message to display
 * @param {Array} props.departments - Available departments/teams
 * @param {Array} props.permissions - Available permission options
 * @param {string} props.label - Label for the field (optional)
 * @param {string} props.description - Description text (optional)
 * @returns {JSX.Element} Department permissions field
 */
export default function DepartmentPermissionsField({
  value = {},
  onChange,
  error,
  departments = [],
  permissions = [],
  label = 'Department Access & Permissions',
  description = 'Select departments and assign specific permissions for each. View analyses is automatically assigned when a department is enabled.',
}) {
  /**
   * Toggle a department on/off
   */
  const handleToggleDepartment = (departmentId) => {
    const current = value[departmentId] || {
      enabled: false,
      permissions: [],
    };
    const newEnabled = !current.enabled;

    onChange({
      ...value,
      [departmentId]: {
        enabled: newEnabled,
        permissions: newEnabled ? ['view_analyses'] : [],
      },
    });
  };

  /**
   * Toggle a specific permission for a department
   */
  const handleTogglePermission = (departmentId, permission) => {
    const current = value[departmentId] || {
      enabled: false,
      permissions: [],
    };
    const currentPermissions = current.permissions || [];

    let newPermissions;
    if (currentPermissions.includes(permission)) {
      newPermissions = currentPermissions.filter((p) => p !== permission);
      // Ensure at least 'view_analyses' is always present
      if (newPermissions.length === 0) {
        newPermissions = ['view_analyses'];
      }
    } else {
      newPermissions = [...currentPermissions, permission];
    }

    onChange({
      ...value,
      [departmentId]: {
        ...current,
        permissions: newPermissions,
      },
    });
  };

  return (
    <Stack gap="md">
      <Divider />

      <Text size="sm" fw={600} c="dimmed">
        {label}
      </Text>
      <Text size="xs" c="dimmed">
        {description}
      </Text>

      <FormAlert type="error" message={error} />

      <Stack gap="xs" mah="40vh" style={{ overflow: 'auto' }}>
        {departments.map((department) => {
          const deptPerms = value[department.value] || {
            enabled: false,
            permissions: [],
          };
          const isEnabled = deptPerms.enabled;
          const deptPermissions = deptPerms.permissions || [];

          return (
            <Paper
              key={department.value}
              withBorder
              p="md"
              style={{
                backgroundColor: isEnabled
                  ? 'var(--mantine-color-blue-light)'
                  : 'transparent',
                borderColor: isEnabled
                  ? 'var(--mantine-color-blue-6)'
                  : 'var(--mantine-color-gray-3)',
              }}
            >
              <Stack gap="sm">
                {/* Department Header */}
                <Group
                  justify="space-between"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleToggleDepartment(department.value)}
                >
                  <Group gap="sm">
                    <Checkbox
                      checked={isEnabled}
                      onChange={() => handleToggleDepartment(department.value)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Toggle ${department.label}`}
                    />
                    <Text fw={500} size="sm">
                      {department.label}
                    </Text>
                  </Group>
                  {isEnabled && (
                    <Badge size="xs" variant="light" color="blue">
                      {deptPermissions.length} permission
                      {deptPermissions.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </Group>

                {/* Permissions for this department */}
                {isEnabled && (
                  <Box ml="xl">
                    <Stack gap="xs">
                      {permissions.map((permission) => (
                        <Group key={permission.value} gap="sm">
                          <Checkbox
                            size="sm"
                            checked={deptPermissions.includes(permission.value)}
                            onChange={() =>
                              handleTogglePermission(
                                department.value,
                                permission.value,
                              )
                            }
                            disabled={permission.value === 'view_analyses'} // Always enabled as default
                            label={
                              <Text size="sm">
                                {permission.label}
                                {permission.value === 'view_analyses' && (
                                  <Text
                                    component="span"
                                    size="xs"
                                    c="dimmed"
                                    ml="xs"
                                  >
                                    (default)
                                  </Text>
                                )}
                              </Text>
                            }
                          />
                        </Group>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
}

DepartmentPermissionsField.propTypes = {
  value: PropTypes.objectOf(
    PropTypes.shape({
      enabled: PropTypes.bool.isRequired,
      permissions: PropTypes.arrayOf(PropTypes.string).isRequired,
    }),
  ),
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  departments: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ),
  permissions: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ),
  label: PropTypes.string,
  description: PropTypes.string,
};
