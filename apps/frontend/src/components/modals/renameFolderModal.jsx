// frontend/src/components/modals/renameFolderModal.jsx
import { Modal, TextInput, Button, Stack } from '@mantine/core';
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { notifications } from '@mantine/notifications';
import teamService from '../../services/teamService';

export default function RenameFolderModal({
  opened,
  onClose,
  teamId,
  folderId,
  currentName,
}) {
  const [name, setName] = useState(currentName || '');
  const [loading, setLoading] = useState(false);

  // Update name when currentName prop changes
  useEffect(() => {
    setName(currentName || '');
  }, [currentName]);

  const handleRename = async () => {
    if (!name.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Folder name is required',
        color: 'red',
      });
      return;
    }

    if (name.trim() === currentName) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await teamService.updateFolder(teamId, folderId, {
        name: name.trim(),
      });

      notifications.show({
        title: 'Success',
        message: `Folder renamed to "${name}"`,
        color: 'green',
      });

      onClose();
    } catch (error) {
      console.error('Error renaming folder:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to rename folder',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleRename();
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Rename Folder" size="md">
      <Stack>
        <TextInput
          label="Folder Name"
          placeholder="Enter new folder name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyPress={handleKeyPress}
          required
          autoFocus
          data-autofocus
        />

        <Button onClick={handleRename} loading={loading} fullWidth>
          Rename Folder
        </Button>
      </Stack>
    </Modal>
  );
}

RenameFolderModal.propTypes = {
  opened: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  teamId: PropTypes.string.isRequired,
  folderId: PropTypes.string.isRequired,
  currentName: PropTypes.string.isRequired,
};
