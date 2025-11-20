import { TextInput, Stack } from '@mantine/core';
import { FormActionButtons, FormAlert } from '../../components/global';
import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { modals } from '@mantine/modals';
import teamService from '../../services/teamService';
import { notificationAPI } from '../../utils/notificationAPI.jsx';
import { useStandardForm } from '../../hooks/forms/useStandardForm';
import { useEnterKeySubmit } from '../../hooks/forms/useEnterKeySubmit';

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

  // Initialize form with useStandardForm
  const { form, submitOperation, handleSubmit } = useStandardForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (!value?.trim() ? 'Folder name is required' : null),
    },
    resetOnSuccess: true,
  });

  // Update modal title dynamically based on whether it's a subfolder
  useEffect(() => {
    const title = parentFolderId
      ? `Create Subfolder in "${parentFolderName}"`
      : 'Create Folder';
    context.updateModal({ id, title });
    // context and id are stable references from Mantine and should NOT be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentFolderId, parentFolderName]);

  const handleCreate = handleSubmit(async (values) => {
    // If in reorder mode (onCreatePending provided), handle locally
    if (onCreatePending) {
      onCreatePending({
        name: values.name.trim(),
        parentFolderId: parentFolderId || null,
      });
      notificationAPI.info(
        `Folder "${values.name.trim()}" added to preview. Click Done to save changes.`,
        'Folder Added',
      );
      modals.close(id);
      return;
    }

    // Otherwise, create folder via API
    await teamService.createFolder(teamId, {
      name: values.name.trim(),
      parentFolderId: parentFolderId || undefined,
    });
    notificationAPI.success(`Folder "${values.name}" created successfully`);
    modals.close(id);
  });

  const handleKeyDown = useEnterKeySubmit(() => handleCreate());

  return (
    <form onSubmit={handleCreate}>
      <Stack>
        <FormAlert type="error" message={submitOperation.error} />

        <TextInput
          label="Folder Name"
          placeholder="Enter folder name..."
          {...form.getInputProps('name')}
          onKeyDown={handleKeyDown}
          required
          data-autofocus
        />

        <FormActionButtons
          type="submit"
          loading={submitOperation.loading}
          submitLabel="Create Folder"
          fullWidth
        />
      </Stack>
    </form>
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
