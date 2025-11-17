import PropTypes from 'prop-types';
import { Table, Text, Badge, Stack } from '@mantine/core';
import { ActionMenu } from '../../../components/global/menus/ActionMenu';
import {
  IconEdit,
  IconTrash,
  IconUserCheck,
  IconBan,
  IconCircleCheck,
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
                {user.memberRole === 'owner' ? (
                  <Badge variant="filled" color="brand">
                    Owner
                  </Badge>
                ) : (
                  <Badge
                    variant="light"
                    color={user.role === 'admin' ? 'blue' : 'gray'}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {user.role || 'user'}
                  </Badge>
                )}
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
              <ActionMenu
                items={[
                  // Only show Edit for non-owner users
                  ...(user.memberRole !== 'owner'
                    ? [
                        {
                          label: 'Edit User',
                          icon: <IconEdit size={16} />,
                          onClick: () => onEdit(user),
                        },
                      ]
                    : []),
                  // Only show other actions if not current user AND not owner
                  ...(user.id !== currentUser?.id && user.memberRole !== 'owner'
                    ? [
                        { type: 'divider' },
                        {
                          label: 'Impersonate User',
                          icon: <IconUserCheck size={16} />,
                          onClick: () => onImpersonate(user),
                          color: 'violet',
                        },
                        {
                          label: 'Manage Sessions',
                          icon: <IconDeviceLaptop size={16} />,
                          onClick: () => onManageSessions(user),
                          color: 'blue',
                        },
                        { type: 'divider' },
                        user.banned
                          ? {
                              label: 'Unban User',
                              icon: <IconCircleCheck size={16} />,
                              onClick: () => onUnbanUser(user),
                              color: 'green',
                            }
                          : {
                              label: 'Ban User',
                              icon: <IconBan size={16} />,
                              onClick: () => onBanUser(user),
                              color: 'red',
                            },
                        {
                          label: 'Delete User',
                          icon: <IconTrash size={16} />,
                          onClick: () => onDelete(user),
                          color: 'red',
                        },
                      ]
                    : []),
                ]}
                shadow="md"
                width={200}
                triggerSize="lg"
                triggerVariant="subtle"
                triggerColor="brand"
              />
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
      memberRole: PropTypes.string, // Organization member role (owner/admin/member)
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
