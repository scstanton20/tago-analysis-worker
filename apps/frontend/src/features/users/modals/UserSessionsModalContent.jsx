/**
 * User sessions modal content component
 * Manages viewing and revoking user sessions
 * @module modals/components/UserSessionsModalContent
 */

import { useState, useCallback } from 'react';
import { Stack, Group, Text, Table, Badge, ActionIcon } from '@mantine/core';
import {
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceDesktop,
  IconTrash,
  IconRefresh,
} from '@tabler/icons-react';
import PropTypes from 'prop-types';
import {
  FormAlert,
  LoadingState,
  SecondaryButton,
  DangerButton,
  ConfirmDialog,
} from '@/components/global';
import { admin } from '@/features/auth/lib/auth';
import { notificationAPI } from '@/utils/notificationAPI.jsx';
import { useAsyncOperation, useAsyncEffect } from '@/hooks/async';
import logger from '@/utils/logger';
import { userService } from '../api/userService';

/**
 * UserSessionsModalContent
 * Content component for user sessions modal
 *
 * @param {Object} props - Component props
 * @param {Object} props.innerProps - Modal inner props
 * @param {Object} props.innerProps.user - User object to manage sessions for
 * @returns {JSX.Element} Modal content
 */
function UserSessionsModalContent({ innerProps }) {
  const { user } = innerProps;
  const [sessions, setSessions] = useState([]);
  const revokeSessionOperation = useAsyncOperation();
  const revokeAllOperation = useAsyncOperation();

  // Shared session parsing logic extracted to reduce duplication
  const parseSessionsResponse = useCallback((result) => {
    if (result.error) {
      throw new Error(result.error.message);
    }

    let sessionsData = [];
    if (result.data && Array.isArray(result.data)) {
      sessionsData = result.data;
    } else if (
      result.data &&
      result.data.sessions &&
      Array.isArray(result.data.sessions)
    ) {
      sessionsData = result.data.sessions;
    } else if (Array.isArray(result)) {
      sessionsData = result;
    } else {
      logger.warn('Unexpected sessions response structure:', result);
      sessionsData = [];
    }

    return sessionsData;
  }, []);

  // Load sessions when component mounts (modal opens)
  const loadSessionsOperation = useAsyncEffect(async () => {
    if (!user?.id) return;

    const result = await admin.listUserSessions({
      userId: user.id,
    });

    logger.log('List sessions result:', result);
    const sessionsData = parseSessionsResponse(result);
    setSessions(sessionsData);
  }, [user?.id, parseSessionsResponse]);

  // Helper function to manually reload sessions
  const loadSessions = useCallback(async () => {
    if (!user?.id) return;

    await loadSessionsOperation.execute(async () => {
      const result = await admin.listUserSessions({
        userId: user.id,
      });

      logger.log('List sessions result:', result);
      const sessionsData = parseSessionsResponse(result);
      setSessions(sessionsData);
    });
  }, [user.id, loadSessionsOperation, parseSessionsResponse]);

  const handleRevokeSession = async (sessionToken) => {
    ConfirmDialog.destructive({
      title: 'Revoke Session',
      message: 'Are you sure you want to revoke this session?',
      confirmLabel: 'Revoke',
      onConfirm: async () => {
        await executeRevokeSession(sessionToken);
      },
    });
  };

  const executeRevokeSession = async (sessionToken) => {
    await revokeSessionOperation.execute(async () => {
      logger.log('Attempting to revoke session token:', sessionToken);

      const result = await admin.revokeUserSession({
        sessionToken,
      });

      logger.log('Revoke session result:', result);

      if (result.error) {
        logger.error('Error in revoke session result:', result.error);
        throw new Error(result.error.message);
      }

      // Force logout the user to immediately notify them
      try {
        await userService.forceLogout(
          user.id,
          'Your session has been revoked by an administrator',
        );
        logger.log(
          `✓ Forced logout for user ${user.id} after session revocation`,
        );
      } catch (logoutError) {
        logger.warn('Failed to force logout user:', logoutError);
        // Continue even if force logout fails
      }

      notificationAPI.success('Session revoked successfully');

      // Reload sessions to see if it's actually gone
      logger.log('Reloading sessions after revocation...');
      await loadSessions();

      // Test if the session is actually invalid by checking with the server
      logger.log('Testing session validity...');
      try {
        const sessionCheck = await userService.getCurrentSession();
        logger.log('Current session check after revocation:', sessionCheck);
      } catch (error) {
        logger.log('Session validation error (expected):', error);
      }
    });
  };

  const handleRevokeAllSessions = async () => {
    ConfirmDialog.destructive({
      title: 'Revoke All Sessions',
      message: `Are you sure you want to revoke ALL sessions for ${user.name || user.email}? This will log them out of all devices.`,
      confirmLabel: 'Revoke All',
      onConfirm: async () => {
        await executeRevokeAllSessions();
      },
    });
  };

  const executeRevokeAllSessions = async () => {
    await revokeAllOperation.execute(async () => {
      logger.log('Attempting to revoke all sessions for user:', user.id);

      const result = await admin.revokeUserSessions({
        userId: user.id,
      });

      logger.log('Revoke all sessions result:', result);

      if (result.error) {
        logger.error('Error in revoke all sessions result:', result.error);
        throw new Error(result.error.message);
      }

      // Force logout the user to immediately notify them
      try {
        await userService.forceLogout(
          user.id,
          'All your sessions have been revoked by an administrator',
        );
        logger.log(
          `✓ Forced logout for user ${user.id} after all sessions revocation`,
        );
      } catch (logoutError) {
        logger.warn('Failed to force logout user:', logoutError);
        // Continue even if force logout fails
      }

      notificationAPI.success(
        `All sessions revoked for ${user.name || user.email}`,
      );

      // Reload sessions to verify they're gone
      logger.log('Reloading sessions after revoking all...');
      await loadSessions();
    });
  };

  const getDeviceIcon = (userAgent) => {
    if (!userAgent) return <IconDeviceDesktop size={16} />;

    const ua = userAgent.toLowerCase();
    if (
      ua.includes('mobile') ||
      ua.includes('android') ||
      ua.includes('iphone')
    ) {
      return <IconDeviceMobile size={16} />;
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return <IconDeviceLaptop size={16} />;
    }
    return <IconDeviceDesktop size={16} />;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString();
  };

  const getSessionStatus = (session) => {
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);

    if (expiresAt < now) {
      return (
        <Badge color="red" variant="light">
          Expired
        </Badge>
      );
    }

    return (
      <Badge color="green" variant="light">
        Active
      </Badge>
    );
  };

  const isLoading =
    loadSessionsOperation.loading ||
    revokeSessionOperation.loading ||
    revokeAllOperation.loading;

  const operationError =
    loadSessionsOperation.error ||
    revokeSessionOperation.error ||
    revokeAllOperation.error;

  return (
    <LoadingState loading={isLoading}>
      <Stack gap="md">
        {/* Custom Modal Header */}
        <Group gap="xs" mb="md">
          <IconDeviceLaptop size={20} aria-hidden="true" />
          <Text fw={600} size="lg">
            Sessions for {user?.name || user?.email}
          </Text>
        </Group>
        <FormAlert type="error" message={operationError} />

        <Group justify="space-between">
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              Manage active sessions for this user
            </Text>
            <Text size="xs" c="dimmed">
              Note: Users will be logged out automatically next time a page
              refresh occurs.
            </Text>
          </Stack>
          <Group gap="sm">
            <SecondaryButton
              leftSection={<IconRefresh size="1rem" />}
              onClick={loadSessions}
              size="sm"
            >
              Refresh
            </SecondaryButton>
            <DangerButton
              leftSection={<IconTrash size="1rem" />}
              onClick={handleRevokeAllSessions}
              size="sm"
              disabled={!sessions.length}
            >
              Revoke All
            </DangerButton>
          </Group>
        </Group>

        {!Array.isArray(sessions) || sessions.length === 0 ? (
          <Text ta="center" c="dimmed" py="xl">
            {!Array.isArray(sessions)
              ? 'Error loading sessions data'
              : 'No active sessions found'}
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Device</Table.Th>
                <Table.Th>IP Address</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Expires</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sessions.map((session, index) => {
                logger.log('Session data:', session); // Debug each session
                return (
                  <Table.Tr key={session.token || session.id || index}>
                    <Table.Td>
                      <Group gap="xs">
                        {getDeviceIcon(session.userAgent)}
                        <Text size="sm" title={session.userAgent}>
                          {session.userAgent
                            ? session.userAgent.length > 50
                              ? session.userAgent.substring(0, 50) + '...'
                              : session.userAgent
                            : 'Unknown Device'}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{session.ipAddress || 'Unknown'}</Table.Td>
                    <Table.Td>{formatDate(session.createdAt)}</Table.Td>
                    <Table.Td>{formatDate(session.expiresAt)}</Table.Td>
                    <Table.Td>{getSessionStatus(session)}</Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="sm"
                        onClick={() =>
                          handleRevokeSession(session.token || session.id)
                        }
                        aria-label="Revoke this session"
                        disabled={!session.token && !session.id}
                      >
                        <IconTrash size="1rem" aria-hidden="true" />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </LoadingState>
  );
}

UserSessionsModalContent.propTypes = {
  innerProps: PropTypes.shape({
    user: PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
      email: PropTypes.string,
    }).isRequired,
  }).isRequired,
};

export default UserSessionsModalContent;
