/**
 * User Management modal content component
 * Manages system users, permissions, and access control
 * @module modals/components/UserManagementModalContent
 */

import { useEffect, useEffectEvent } from 'react';
import {
  Stack,
  Group,
  CopyButton,
  Text,
  ActionIcon,
  Tooltip,
  CloseButton,
} from '@mantine/core';
import {
  FormAlert,
  ContentBox,
  LoadingState,
  PrimaryButton,
} from '../../components/global';
import { IconPlus, IconUser, IconCopy, IconCheck } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { useAuth } from '../../hooks/useAuth';
import { useUserManagement } from '../../hooks/user-management';
import UserTable from './users/UserTable.jsx';
import UserForm from './users/UserForm.jsx';
import PropTypes from 'prop-types';

/**
 * UserManagementModalContent
 * Content component for user management modal
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Modal ID for closing
 * @returns {JSX.Element} Modal content
 */
function UserManagementModalContent({ id }) {
  const { user: currentUser, isAdmin } = useAuth();

  // Use the custom hook that encapsulates all the business logic
  // All context data (currentUser, teams, permissions) are accessed internally via hooks
  const {
    // State
    users,
    loading,
    editingUser,
    showCreateForm,
    error,
    createdUserInfo,
    setCreatedUserInfo,
    availableTeams,
    actions,
    formState,
    isOwnerEditingSelf,
    // Functions
    loadUsers,
    loadActions,
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
    handleUsernameBlur,
  } = useUserManagement();

  // Wrap data loading in useEffectEvent since loadUsers and loadActions are stable
  // callbacks from useUserManagement hook that don't need to be in deps
  const loadData = useEffectEvent(() => {
    loadUsers();
    loadActions();
  });

  // Load data when user becomes admin
  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  // Only show if user is admin
  if (!isAdmin) {
    return null;
  }

  // Handle close button click - conditionally close form or modal
  const handleCloseClick = () => {
    if (showCreateForm || createdUserInfo) {
      handleCancel(); // Just close the form, stay in modal
    } else {
      modals.close(id); // Close the entire modal
    }
  };

  return (
    <LoadingState loading={loading}>
      <Stack gap="md">
        {/* Custom Modal Header */}
        <Group gap="xs" justify="space-between" mb="md">
          <Group gap="xs">
            <IconUser size={20} aria-hidden="true" />
            <Text fw={600} size="lg">
              User Management
            </Text>
          </Group>
          <Group gap="xs">
            <CloseButton
              onClick={handleCloseClick}
              size="lg"
              aria-label={
                showCreateForm || createdUserInfo
                  ? 'Close form and return to user list'
                  : 'Close user management'
              }
            />
          </Group>
        </Group>
        <FormAlert type="error" message={error} />

        {createdUserInfo ? (
          <ContentBox>
            <Stack gap="md">
              <Text fw={600} size="lg" ta="center" c="green">
                User Created Successfully!
              </Text>

              <FormAlert color="green" variant="light">
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
                    The user must sign in with this temporary password and will
                    be required to change it on first login.
                  </Text>
                </Stack>
              </FormAlert>

              <PrimaryButton onClick={() => setCreatedUserInfo(null)}>
                Continue
              </PrimaryButton>
            </Stack>
          </ContentBox>
        ) : !showCreateForm ? (
          <>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Manage user accounts and permissions
              </Text>
              <PrimaryButton
                leftSection={<IconPlus size="1rem" />}
                onClick={handleCreate}
                size="sm"
              >
                Add User
              </PrimaryButton>
            </Group>

            <ContentBox p="xs">
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
            </ContentBox>
          </>
        ) : (
          <ContentBox>
            <UserForm
              formState={formState}
              editingUser={editingUser}
              currentUser={currentUser}
              isOwnerEditingSelf={isOwnerEditingSelf}
              availableTeams={availableTeams}
              availableActions={actions}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              onUsernameBlur={handleUsernameBlur}
            />
          </ContentBox>
        )}
      </Stack>
    </LoadingState>
  );
}

UserManagementModalContent.propTypes = {
  id: PropTypes.string.isRequired,
};

export default UserManagementModalContent;
