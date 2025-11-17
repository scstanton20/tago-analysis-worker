/**
 * Team creation form component
 * Handles new team name and color selection
 * @module components/teams/TeamCreateForm
 */

import PropTypes from 'prop-types';
import { useForm } from '@mantine/form';
import { Box, Stack, Group, Text, TextInput, ColorSwatch } from '@mantine/core';
import { TeamColorPicker, PREDEFINED_COLORS } from './TeamColorPicker';
import { FormActionButtons } from '../global';

export function TeamCreateForm({ usedNames, usedColors, isLoading, onSubmit }) {
  // Form setup with validation
  const form = useForm({
    initialValues: {
      name: '',
      color: '#228BE6', // default blue
    },
    validate: {
      name: (value) => {
        if (!value?.trim()) return 'Team name is required';
        if (usedNames.has(value.toLowerCase().trim())) {
          return 'This name is already in use';
        }
        return null;
      },
      color: (value) => (!value ? 'Color is required' : null),
    },
  });

  // Handle form submission
  const handleSubmit = form.onSubmit(async (values) => {
    // Call parent's onSubmit with form values
    const success = await onSubmit(values);

    // Reset form on successful creation
    if (success) {
      form.reset();
    }
  });

  // Handle cancel - reset form to initial state
  const handleCancel = () => {
    form.reset();
  };

  return (
    <Box>
      <Text size="sm" fw={600} mb="sm">
        Create New Team
      </Text>
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          <TextInput
            label="Team Name"
            placeholder="Enter team name"
            description="Choose a unique name for your team"
            size="sm"
            disabled={isLoading}
            required
            {...form.getInputProps('name')}
          />

          <Box>
            <Text size="xs" c="dimmed" mb="xs">
              Choose a color (required):
            </Text>
            <TeamColorPicker
              selectedColor={form.values.color}
              usedColors={usedColors}
              onColorSelect={(color) => form.setFieldValue('color', color)}
              size={32}
              showLabel={false}
              showSelected={false}
            />
            {form.errors.color && (
              <Text size="xs" c="red" mt="xs">
                {form.errors.color}
              </Text>
            )}
          </Box>

          <Group justify="space-between">
            {form.values.color ? (
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  Selected:
                </Text>
                <ColorSwatch color={form.values.color} size={20} />
                <Text size="xs" fw={500}>
                  {form.values.color}
                </Text>
              </Group>
            ) : (
              <Text size="xs" c="dimmed">
                No color selected
              </Text>
            )}
            <FormActionButtons
              onSubmit={handleSubmit}
              onCancel={form.isDirty() ? handleCancel : undefined}
              disabled={!form.isValid() || isLoading}
              loading={isLoading}
              size="sm"
              submitLabel="Create"
            />
          </Group>
        </Stack>
      </form>
    </Box>
  );
}

TeamCreateForm.propTypes = {
  usedNames: PropTypes.instanceOf(Set).isRequired,
  usedColors: PropTypes.instanceOf(Set).isRequired,
  isLoading: PropTypes.bool,
  onSubmit: PropTypes.func.isRequired,
};
