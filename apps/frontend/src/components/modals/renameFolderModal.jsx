// frontend/src/components/modals/renameFolderModal.jsx
import { Modal, TextInput, Button, Stack } from '@mantine/core';
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import teamService from '../../services/teamService';
import logger from '../../utils/logger';
import { useNotifications } from '../../hooks/useNotifications';

export default function RenameFolderModal({
  opened,
  onClose,
  teamId,
  folderId,
  currentName,
}) {
  const notify = useNotifications();
  const [name, setName] = useState(currentName || '');
  const [loading, setLoading] = useState(false);

  // Update name when currentName prop changes
  useEffect(() => {
    setName(currentName || '');
  }, [currentName]);

  const handleRename = async () => {
    if (!name.trim()) {
      notify.error('Folder name is required');
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

      notify.success(`Folder renamed to "${name}"`);

      onClose();
    } catch (error) {
      logger.error('Error renaming folder:', error);
      notify.error(error.message || 'Failed to rename folder');
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
