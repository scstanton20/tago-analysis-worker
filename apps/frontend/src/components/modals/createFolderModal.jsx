// frontend/src/components/modals/createFolderModal.jsx
import { Modal, TextInput, Button, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import PropTypes from 'prop-types';
import { notifications } from '@mantine/notifications';
import teamService from '../../services/teamService';
import logger from '../../utils/logger';

export default function CreateFolderModal({
  opened,
  onClose,
  teamId,
  parentFolderId = null,
  parentFolderName = null,
  onCreatePending = null,
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Folder name is required',
        color: 'red',
      });
      return;
    }

    // If in reorder mode (onCreatePending provided), handle locally
    if (onCreatePending) {
      onCreatePending({
        name: name.trim(),
        parentFolderId: parentFolderId || null,
      });
      setName('');
      onClose();
      return;
    }

    setLoading(true);
    try {
      await teamService.createFolder(teamId, {
        name: name.trim(),
        parentFolderId: parentFolderId || undefined,
      });

      notifications.show({
        title: 'Success',
        message: `Folder "${name}" created successfully`,
        color: 'green',
      });

      setName('');
      onClose();
    } catch (error) {
      logger.error('Error creating folder:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create folder',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCreate();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      aria-labelledby="create-folder-modal-title"
      title={
        <Text fw={600} id="create-folder-modal-title">
          {parentFolderId
            ? `Create Subfolder in "${parentFolderName}"`
            : 'Create Folder'}
        </Text>
      }
      size="md"
    >
      <Stack>
        <TextInput
          label="Folder Name"
          placeholder="Enter folder name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyPress={handleKeyPress}
          required
        />

        <Button onClick={handleCreate} loading={loading} fullWidth>
          Create Folder
        </Button>
      </Stack>
    </Modal>
  );
}

CreateFolderModal.propTypes = {
  opened: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  teamId: PropTypes.string.isRequired,
  parentFolderId: PropTypes.string,
  parentFolderName: PropTypes.string,
  onCreatePending: PropTypes.func,
};
