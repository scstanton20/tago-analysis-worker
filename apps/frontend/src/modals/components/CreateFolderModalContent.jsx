import { TextInput, Button, Stack } from '@mantine/core';
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { modals } from '@mantine/modals';
import teamService from '../../services/teamService';
import logger from '../../utils/logger';
import { useNotifications } from '../../hooks/useNotifications';

/**
 * CreateFolderModalContent
 *
 * Modal content for creating new folders/subfolders in the team hierarchy.
 * Supports both direct creation and "pending" mode for reorder operations.
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Unique modal instance ID
 * @param {Object} props.context - Mantine modal context
 * @param {Object} props.innerProps - Custom props passed via modalService
 * @param {string} props.innerProps.teamId - The team ID to create folder in
 * @param {string} props.innerProps.parentFolderId - Optional parent folder ID for subfolders
 * @param {string} props.innerProps.parentFolderName - Optional parent folder name (for display)
 * @param {Function} props.innerProps.onCreatePending - Optional callback for pending folder creation (reorder mode)
 */
const CreateFolderModalContent = ({ id, context, innerProps }) => {
  const {
    teamId,
    parentFolderId = null,
    parentFolderName = null,
    onCreatePending = null,
  } = innerProps;

  const notify = useNotifications();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Update modal title dynamically based on whether it's a subfolder
  useEffect(() => {
    const title = parentFolderId
      ? `Create Subfolder in "${parentFolderName}"`
      : 'Create Folder';
    context.updateModal({ id, title });
    // context and id are stable references from Mantine and should NOT be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentFolderId, parentFolderName]);

  const handleCreate = async () => {
    if (!name.trim()) {
      notify.error('Folder name is required');
      return;
    }

    // If in reorder mode (onCreatePending provided), handle locally
    if (onCreatePending) {
      onCreatePending({
        name: name.trim(),
        parentFolderId: parentFolderId || null,
      });
      setName('');
      modals.close(id);
      return;
    }

    setLoading(true);
    try {
      await teamService.createFolder(teamId, {
        name: name.trim(),
        parentFolderId: parentFolderId || undefined,
      });

      notify.success(`Folder "${name}" created successfully`);

      setName('');
      modals.close(id);
    } catch (error) {
      logger.error('Error creating folder:', error);
      notify.error(error.message || 'Failed to create folder');
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
    <Stack>
      <TextInput
        label="Folder Name"
        placeholder="Enter folder name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyPress={handleKeyPress}
        required
        data-autofocus
      />

      <Button onClick={handleCreate} loading={loading} fullWidth>
        Create Folder
      </Button>
    </Stack>
  );
};

CreateFolderModalContent.propTypes = {
  id: PropTypes.string.isRequired,
  context: PropTypes.object.isRequired,
  innerProps: PropTypes.shape({
    teamId: PropTypes.string.isRequired,
    parentFolderId: PropTypes.string,
    parentFolderName: PropTypes.string,
    onCreatePending: PropTypes.func,
  }).isRequired,
};

export default CreateFolderModalContent;
