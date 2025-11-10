// frontend/src/modals/components/RenameFolderModalContent.jsx
import { TextInput, Button, Stack } from '@mantine/core';
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { modals } from '@mantine/modals';
import teamService from '../../services/teamService';
import logger from '../../utils/logger';
import { useNotifications } from '../../hooks/useNotifications';

/**
 * RenameFolderModalContent
 *
 * Modal content for renaming existing folders in the team hierarchy.
 * Updates the folder name via the team service and provides user feedback.
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Unique modal instance ID
 * @param {Object} props.innerProps - Custom props passed via modalService
 * @param {string} props.innerProps.teamId - The team ID containing the folder
 * @param {string} props.innerProps.folderId - The folder ID to rename
 * @param {string} props.innerProps.currentName - The current folder name
 */
const RenameFolderModalContent = ({ id, innerProps }) => {
  const { teamId, folderId, currentName } = innerProps;

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
      modals.close(id);
      return;
    }

    setLoading(true);
    try {
      await teamService.updateFolder(teamId, folderId, {
        name: name.trim(),
      });

      notify.success(`Folder renamed to "${name}"`);

      modals.close(id);
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
    <Stack>
      <TextInput
        label="Folder Name"
        placeholder="Enter new folder name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyPress={handleKeyPress}
        required
        data-autofocus
      />

      <Button onClick={handleRename} loading={loading} fullWidth>
        Rename Folder
      </Button>
    </Stack>
  );
};

RenameFolderModalContent.propTypes = {
  id: PropTypes.string.isRequired,
  innerProps: PropTypes.shape({
    teamId: PropTypes.string.isRequired,
    folderId: PropTypes.string.isRequired,
    currentName: PropTypes.string.isRequired,
  }).isRequired,
};

export default RenameFolderModalContent;
