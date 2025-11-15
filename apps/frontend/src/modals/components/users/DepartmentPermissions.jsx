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
import { FormAlert } from '../../../components/global';

/**
 * Department Permissions Component
 * Renders a list of departments with checkboxes for enabling/disabling access
 * and nested permission checkboxes for each enabled department
 */
export default function DepartmentPermissions({
  availableTeams,
  availableActions,
  departmentPermissions,
  onToggleDepartment,
  onTogglePermission,
  error,
}) {
  return (
    <Stack gap="md">
      <Divider />

      <Text size="sm" fw={600} c="dimmed">
        Department Access & Permissions
      </Text>
      <Text size="xs" c="dimmed">
        Select departments and assign specific permissions for each. View
        analyses is automatically assigned when a department is enabled.
      </Text>

      <FormAlert type="error" message={error} />

      <Stack gap="xs" mah="40vh" style={{ overflow: 'auto' }}>
        {availableTeams.map((team) => {
          const teamPerms = departmentPermissions[team.value] || {
            enabled: false,
            permissions: [],
          };
          const isEnabled = teamPerms.enabled;
          const permissions = teamPerms.permissions || [];

          return (
            <Paper
              key={team.value}
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
                  onClick={() => onToggleDepartment(team.value)}
                >
                  <Group gap="sm">
                    <Checkbox
                      checked={isEnabled}
                      onChange={() => onToggleDepartment(team.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Text fw={500} size="sm">
                      {team.label}
                    </Text>
                  </Group>
                  {isEnabled && (
                    <Badge size="xs" variant="light" color="blue">
                      {permissions.length} permission
                      {permissions.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </Group>

                {/* Permissions for this department */}
                {isEnabled && (
                  <Box ml="xl">
                    <Stack gap="xs">
                      {availableActions.map((action) => (
                        <Group key={action.value} gap="sm">
                          <Checkbox
                            size="sm"
                            checked={permissions.includes(action.value)}
                            onChange={() =>
                              onTogglePermission(team.value, action.value)
                            }
                            disabled={action.value === 'view_analyses'} // Always enabled as default
                            label={
                              <Text size="sm">
                                {action.label}
                                {action.value === 'view_analyses' && (
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

DepartmentPermissions.propTypes = {
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
  departmentPermissions: PropTypes.objectOf(
    PropTypes.shape({
      enabled: PropTypes.bool.isRequired,
      permissions: PropTypes.arrayOf(PropTypes.string).isRequired,
    }),
  ).isRequired,
  onToggleDepartment: PropTypes.func.isRequired,
  onTogglePermission: PropTypes.func.isRequired,
  error: PropTypes.string,
};
