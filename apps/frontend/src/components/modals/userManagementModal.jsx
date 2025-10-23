import PropTypes from 'prop-types';
import { useModalDataLoader } from '../../hooks/useModalDataLoader';
import {
  Modal,
  Stack,
  Group,
  CopyButton,
  Button,
  Text,
  Alert,
  Box,
  Paper,
  LoadingOverlay,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconPlus,
  IconUser,
  IconAlertCircle,
  IconCopy,
  IconCheck,
} from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import { useUserManagement } from '../../hooks/useUserManagement';
import { useTeams } from '../../contexts/sseContext/index';
import UserSessionsModal from './userSessionsModal';
import UserTable from '../users/UserTable';
import UserForm from '../users/UserForm';

/**
 * User Management Modal
 * Main modal for managing system users
 * Refactored to use custom hooks and extracted components
 */
export default function UserManagementModal({ opened, onClose }) {
  const { user: currentUser, isAdmin, refetchSession } = useAuth();
  const { organizationId, refreshUserData } = usePermissions();
  const { teams } = useTeams();
  const notify = useNotifications();

  // Use the custom hook that encapsulates all the business logic
  const {
    // State
    users,
    loading,
    editingUser,
    showCreateForm,
    error,
    setError,
    createdUserInfo,
    setCreatedUserInfo,
    showSessionsModal,
    selectedUserForSessions,
    availableTeams,
    actions,
    form,
    isRootUser,
    // Functions
    loadUsers,
    loadActions,
    isOnlyAdmin,
    // Handlers
    handleSubmit,
    handleEdit,
    handleDelete,
    handleImpersonate,
    handleManageSessions,
    handleBanUser,
    handleUnbanUser,
    handleCancel,
    handleCreate,
    handleSessionsModalClose,
    handleUsernameChange,
    handleEmailChange,
    toggleDepartment,
    toggleDepartmentPermission,
  } = useUserManagement({
    currentUser,
    organizationId,
    refreshUserData,
    refetchSession,
    notify,
    teams,
  });

  // Load data when modal opens
  useModalDataLoader(
    opened,
    [loadUsers, loadActions, () => setError('')],
    isAdmin,
  );

  const handleModalClose = () => {
    if (showCreateForm) {
      handleCancel();
    } else {
      handleCancel();
      onClose();
    }
  };

  // Only show if user is admin
  if (!isAdmin) {
    return null;
  }

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      aria-labelledby="user-management-modal-title"
      title={
        <Group gap="xs" justify="space-between" style={{ width: '100%' }}>
          <Group gap="xs">
            <IconUser size={20} aria-hidden="true" />
            <Text fw={600} id="user-management-modal-title">
              User Management
            </Text>
          </Group>
          {showCreateForm && (
            <Text size="sm" c="dimmed">
              Press ESC or click × to close form
            </Text>
          )}
        </Group>
      }
      size="xl"
      centered
    >
      <Box pos="relative">
        <LoadingOverlay visible={loading} />

        <Stack gap="md">
          {error && (
            <Alert
              icon={<IconAlertCircle size="1rem" />}
              color="red"
              variant="light"
            >
              {error}
            </Alert>
          )}

          {createdUserInfo ? (
            <Paper withBorder p="md">
              <Stack gap="md">
                <Text fw={600} size="lg" ta="center" c="green">
                  User Created Successfully!
                </Text>

                <Alert color="green" variant="light">
                  <Stack gap="xs">
                    <Text fw={500}>Name: {createdUserInfo.name}</Text>
                    <Text fw={500}>Email: {createdUserInfo.email}</Text>
                    <Text fw={500}>
                      Temporary Password: {createdUserInfo.tempPassword}
                      <CopyButton
                        value={createdUserInfo.tempPassword}
                        timeout={2000}
                      >
                        {({ copied, copy }) => (
                          <Tooltip
                            label={copied ? 'Copied' : 'Copy'}
                            withArrow
                            position="right"
                          >
                            <ActionIcon
                              color={copied ? 'teal' : 'gray'}
                              variant="subtle"
                              onClick={copy}
                              aria-label={
                                copied ? 'Password copied' : 'Copy password'
                              }
                            >
                              {copied ? (
                                <IconCheck size={16} aria-hidden="true" />
                              ) : (
                                <IconCopy size={16} aria-hidden="true" />
                              )}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Text>
                    <Text size="sm" c="dimmed">
                      The user must sign in with this temporary password and
                      will be required to change it on first login.
                    </Text>
                  </Stack>
                </Alert>

                <Button
                  onClick={() => setCreatedUserInfo(null)}
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                >
                  Continue
                </Button>
              </Stack>
            </Paper>
          ) : !showCreateForm ? (
            <>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Manage user accounts and permissions
                </Text>
                <Button
                  leftSection={<IconPlus size="1rem" />}
                  onClick={handleCreate}
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                  size="sm"
                >
                  Add User
                </Button>
              </Group>

              <Paper withBorder p="xs">
                <UserTable
                  users={users}
                  currentUser={currentUser}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onImpersonate={handleImpersonate}
                  onManageSessions={handleManageSessions}
                  onBanUser={handleBanUser}
                  onUnbanUser={handleUnbanUser}
                />
              </Paper>
            </>
          ) : (
            <Paper withBorder p="md">
              <UserForm
                form={form}
                editingUser={editingUser}
                currentUser={currentUser}
                isOnlyAdmin={isOnlyAdmin()}
                isRootUser={isRootUser}
                availableTeams={availableTeams}
                availableActions={actions}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                onUsernameChange={handleUsernameChange}
                onEmailChange={handleEmailChange}
                onToggleDepartment={toggleDepartment}
                onTogglePermission={toggleDepartmentPermission}
              />
            </Paper>
          )}
        </Stack>
      </Box>

      {/* Sessions Management Modal */}
      <UserSessionsModal
        opened={showSessionsModal}
        onClose={handleSessionsModalClose}
        user={selectedUserForSessions}
      />
    </Modal>
  );
}

UserManagementModal.propTypes = {
  opened: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
