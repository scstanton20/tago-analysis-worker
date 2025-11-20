import { TextInput, Stack } from '@mantine/core';
import { FormActionButtons, FormAlert } from '../../components/global';
import PropTypes from 'prop-types';
import { modals } from '@mantine/modals';
import teamService from '../../services/teamService';
import { notificationAPI } from '../../utils/notificationAPI.jsx';
import { useStandardForm } from '../../hooks/forms/useStandardForm';
import { useEnterKeySubmit } from '../../hooks/forms/useEnterKeySubmit';

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

  // Initialize form with useStandardForm
  const { form, submitOperation, handleSubmit } = useStandardForm({
    initialValues: {
      name: currentName || '',
    },
    validate: {
      name: (value) => (!value?.trim() ? 'Folder name is required' : null),
    },
    resetOnSuccess: false, // Don't reset on success since we close the modal
  });

  const handleRename = handleSubmit(async (values) => {
    // If name unchanged, just close modal
    if (values.name.trim() === currentName) {
      modals.close(id);
      return;
    }

    // Update folder name
    await teamService.updateFolder(teamId, folderId, {
      name: values.name.trim(),
    });
    notificationAPI.success(`Folder renamed to "${values.name}"`);
    modals.close(id);
  });

  const handleKeyDown = useEnterKeySubmit(() => handleRename());

  return (
    <form onSubmit={handleRename}>
      <Stack>
        <FormAlert type="error" message={submitOperation.error} />

        <TextInput
          label="Folder Name"
          placeholder="Enter new folder name..."
          {...form.getInputProps('name')}
          onKeyDown={handleKeyDown}
          required
          data-autofocus
        />

        <FormActionButtons
          type="submit"
          loading={submitOperation.loading}
          submitLabel="Rename Folder"
          fullWidth
        />
      </Stack>
    </form>
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
