import { useEffect, useEffectEvent } from 'react';
import PropTypes from 'prop-types';
import { modals } from '@mantine/modals';
import { notificationAPI } from '@/utils/notificationService.jsx';
import { teamService } from '../api/teamService';
import { FolderNameForm } from '../components';

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
function CreateFolderModalContent({ id, context, innerProps }) {
  const {
    teamId,
    parentFolderId = null,
    parentFolderName = null,
    onCreatePending = null,
  } = innerProps;

  const updateModalTitle = useEffectEvent((title) => {
    context.updateModal({ id, title });
  });

  // Update modal title dynamically based on whether it's a subfolder
  useEffect(() => {
    const title = parentFolderId
      ? `Create Subfolder in "${parentFolderName}"`
      : 'Create Folder';
    updateModalTitle(title);
  }, [parentFolderId, parentFolderName]);

  async function handleCreate(name) {
    // If in reorder mode (onCreatePending provided), handle locally
    if (onCreatePending) {
      onCreatePending({
        name,
        parentFolderId: parentFolderId || null,
      });
      notificationAPI.info(
        `Folder "${name}" added to preview. Click Done to save changes.`,
        'Folder Added',
      );
      modals.close(id);
      return;
    }

    // Otherwise, create folder via API
    await teamService.createFolder(teamId, {
      name,
      parentFolderId: parentFolderId || undefined,
    });
    notificationAPI.success(`Folder "${name}" created successfully`);
    modals.close(id);
  }

  return (
    <FolderNameForm
      onSubmit={handleCreate}
      submitLabel="Create Folder"
      placeholder="Enter folder name..."
      resetOnSuccess
    />
  );
}

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
