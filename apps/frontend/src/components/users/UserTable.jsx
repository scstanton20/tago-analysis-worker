import PropTypes from 'prop-types';
import {
  Table,
  Text,
  Badge,
  Stack,
  Group,
  ActionIcon,
  Menu,
} from '@mantine/core';
import {
  IconEdit,
  IconTrash,
  IconUserCheck,
  IconBan,
  IconCircleCheck,
  IconDotsVertical,
  IconDeviceLaptop,
} from '@tabler/icons-react';

/**
 * User Table Component
 * Displays a table of users with their information and action menu
 */
export default function UserTable({
  users,
  currentUser,
  onEdit,
  onDelete,
  onImpersonate,
  onManageSessions,
  onBanUser,
  onUnbanUser,
}) {
  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: '20%' }}>Name</Table.Th>
          <Table.Th style={{ width: '25%' }}>Email</Table.Th>
          <Table.Th style={{ width: '15%' }}>Username</Table.Th>
          <Table.Th style={{ width: '15%' }}>Role</Table.Th>
          <Table.Th style={{ width: '15%' }}>Status</Table.Th>
          <Table.Th style={{ width: '10%' }}>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {users.map((user) => (
          <Table.Tr key={user.id}>
            <Table.Td>
              <Stack gap={2}>
                <Text
                  fw={user.id === currentUser?.id ? 600 : 400}
                  size="sm"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={user.name || 'Unknown'}
                >
                  {user.name || 'Unknown'}
                </Text>
                {user.id === currentUser?.id && (
                  <Badge size="xs" variant="light" color="brand">
                    You
                  </Badge>
                )}
              </Stack>
            </Table.Td>
            <Table.Td>
              <Text
                size="sm"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={user.email}
              >
                {user.email}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text
                size="sm"
                c={user.username ? undefined : 'dimmed'}
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={user.username || 'Not set'}
              >
                {user.username || 'Not set'}
              </Text>
            </Table.Td>
            <Table.Td>
              <Stack gap="xs">
                <Badge
                  variant="light"
                  color={
                    user.role === 'admin'
                      ? 'red'
                      : user.role === 'analyst'
                        ? 'orange'
                        : user.role === 'operator'
                          ? 'yellow'
                          : 'blue'
                  }
                  style={{ textTransform: 'capitalize' }}
                >
                  {user.role || 'user'}
                </Badge>
                {user.banned && (
                  <Badge variant="light" color="red" size="xs">
                    Banned
                  </Badge>
                )}
              </Stack>
            </Table.Td>
            <Table.Td>
              <Badge
                variant="light"
                color={
                  user.requiresPasswordChange === false ||
                  user.requiresPasswordChange === 0
                    ? 'green'
                    : 'orange'
                }
                size="sm"
              >
                {user.requiresPasswordChange === false ||
                user.requiresPasswordChange === 0
                  ? 'Active'
                  : 'Pending'}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Menu shadow="md" width={200} closeOnItemClick={true}>
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    color="brand"
                    aria-label={`Actions for ${user.name || user.email}`}
                  >
                    <IconDotsVertical size={20} aria-hidden="true" />
                  </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                  {/* Edit User */}
                  <Menu.Item
                    onClick={() => onEdit(user)}
                    leftSection={<IconEdit size={16} />}
                  >
                    Edit User
                  </Menu.Item>

                  {user.id !== currentUser?.id && (
                    <>
                      <Menu.Divider />

                      {/* Impersonate User */}
                      <Menu.Item
                        onClick={() => onImpersonate(user)}
                        leftSection={<IconUserCheck size={16} />}
                        color="violet"
                      >
                        Impersonate User
                      </Menu.Item>

                      {/* Manage Sessions */}
                      <Menu.Item
                        onClick={() => onManageSessions(user)}
                        leftSection={<IconDeviceLaptop size={16} />}
                        color="blue"
                      >
                        Manage Sessions
                      </Menu.Item>

                      <Menu.Divider />

                      {/* Ban/Unban User */}
                      {user.banned ? (
                        <Menu.Item
                          onClick={() => onUnbanUser(user)}
                          leftSection={<IconCircleCheck size={16} />}
                          color="green"
                        >
                          Unban User
                        </Menu.Item>
                      ) : (
                        <Menu.Item
                          onClick={() => onBanUser(user)}
                          leftSection={<IconBan size={16} />}
                          color="red"
                        >
                          Ban User
                        </Menu.Item>
                      )}

                      {/* Delete User */}
                      <Menu.Item
                        onClick={() => onDelete(user)}
                        leftSection={<IconTrash size={16} />}
                        color="red"
                      >
                        Delete User
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

UserTable.propTypes = {
  users: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
      email: PropTypes.string.isRequired,
      username: PropTypes.string,
      role: PropTypes.string,
      banned: PropTypes.bool,
      requiresPasswordChange: PropTypes.oneOfType([
        PropTypes.bool,
        PropTypes.number,
      ]),
    }),
  ).isRequired,
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
  }),
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onImpersonate: PropTypes.func.isRequired,
  onManageSessions: PropTypes.func.isRequired,
  onBanUser: PropTypes.func.isRequired,
  onUnbanUser: PropTypes.func.isRequired,
};
