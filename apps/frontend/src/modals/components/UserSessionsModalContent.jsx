/**
 * User sessions modal content component
 * Manages viewing and revoking user sessions
 * @module modals/components/UserSessionsModalContent
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Group,
  Button,
  Text,
  Table,
  Badge,
  ActionIcon,
  Alert,
  LoadingOverlay,
  Box,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceDesktop,
  IconTrash,
  IconRefresh,
  IconAlertCircle,
} from '@tabler/icons-react';
import { admin } from '../../lib/auth';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import { userService } from '../../services/userService';
import logger from '../../utils/logger';
import PropTypes from 'prop-types';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const notify = useNotifications();

  const loadSessions = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError('');

      const result = await admin.listUserSessions({
        userId: user.id,
      });

      logger.log('List sessions result:', result);

      if (result.error) {
        throw new Error(result.error.message);
      }

      // Handle different possible response structures
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

      setSessions(sessionsData);
    } catch (err) {
      logger.error('Error loading sessions:', err);
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load sessions when component mounts (modal opens)
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRevokeSession = async (sessionToken) => {
    modals.openConfirmModal({
      title: 'Revoke Session',
      children: 'Are you sure you want to revoke this session?',
      labels: { confirm: 'Revoke', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await executeRevokeSession(sessionToken);
      },
    });
  };

  const executeRevokeSession = async (sessionToken) => {
    try {
      setLoading(true);
      setError('');

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

      notify.success('Session revoked successfully');

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
    } catch (err) {
      logger.error('Error revoking session:', err);
      setError(err.message || 'Failed to revoke session');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    modals.openConfirmModal({
      title: 'Revoke All Sessions',
      children: `Are you sure you want to revoke ALL sessions for ${user.name || user.email}? This will log them out of all devices.`,
      labels: { confirm: 'Revoke All', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await executeRevokeAllSessions();
      },
    });
  };

  const executeRevokeAllSessions = async () => {
    try {
      setLoading(true);
      setError('');

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

      notify.success(`All sessions revoked for ${user.name || user.email}`);

      // Reload sessions to verify they're gone
      logger.log('Reloading sessions after revoking all...');
      await loadSessions();
    } catch (err) {
      logger.error('Error revoking all sessions:', err);
      setError(err.message || 'Failed to revoke all sessions');
    } finally {
      setLoading(false);
    }
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

  return (
    <Box pos="relative">
      <LoadingOverlay visible={loading} />

      <Stack gap="md">
        {/* Custom Modal Header */}
        <Group gap="xs" mb="md">
          <IconDeviceLaptop size={20} aria-hidden="true" />
          <Text fw={600} size="lg">
            Sessions for {user?.name || user?.email}
          </Text>
        </Group>
        {error && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            color="red"
            variant="light"
          >
            {error}
          </Alert>
        )}

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
            <Button
              leftSection={<IconRefresh size="1rem" />}
              onClick={loadSessions}
              variant="light"
              size="sm"
            >
              Refresh
            </Button>
            <Button
              leftSection={<IconTrash size="1rem" />}
              onClick={handleRevokeAllSessions}
              color="red"
              variant="light"
              size="sm"
              disabled={!sessions.length}
            >
              Revoke All
            </Button>
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
    </Box>
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
