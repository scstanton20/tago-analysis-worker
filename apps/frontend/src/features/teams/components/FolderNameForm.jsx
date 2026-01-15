import { TextInput, Stack } from '@mantine/core';
import PropTypes from 'prop-types';
import { FormActionButtons, FormAlert } from '@/components/global';
import { useStandardForm } from '@/hooks/forms/useStandardForm';

/**
 * FolderNameForm
 *
 * Shared form component for creating and renaming folders.
 * Handles validation and provides a consistent UI for folder name input.
 *
 * @param {Object} props - Component props
 * @param {string} props.initialName - Initial folder name value (empty for create, current name for rename)
 * @param {Function} props.onSubmit - Callback when form is submitted with valid name
 * @param {string} props.submitLabel - Label for the submit button
 * @param {string} props.placeholder - Placeholder text for the input field
 * @param {boolean} props.resetOnSuccess - Whether to reset form on successful submit
 */
export function FolderNameForm({
  initialName = '',
  onSubmit,
  submitLabel,
  placeholder = 'Enter folder name...',
  resetOnSuccess = false,
}) {
  const { form, submitOperation, handleSubmit } = useStandardForm({
    initialValues: {
      name: initialName,
    },
    validate: {
      name: (value) => (!value?.trim() ? 'Folder name is required' : null),
    },
    resetOnSuccess,
  });

  const handleFormSubmit = handleSubmit(async (values) => {
    await onSubmit(values.name.trim());
  });

  return (
    <form onSubmit={handleFormSubmit}>
      <Stack>
        <FormAlert type="error" message={submitOperation.error} />

        <TextInput
          label="Folder Name"
          placeholder={placeholder}
          {...form.getInputProps('name')}
          required
          data-autofocus
        />

        <FormActionButtons
          type="submit"
          loading={submitOperation.loading}
          submitLabel={submitLabel}
          fullWidth
        />
      </Stack>
    </form>
  );
}

FolderNameForm.propTypes = {
  initialName: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
  submitLabel: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  resetOnSuccess: PropTypes.bool,
};
