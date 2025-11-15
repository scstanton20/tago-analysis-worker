/**
 * Team creation form component
 * Handles new team name and color selection
 * @module components/teams/TeamCreateForm
 */

import PropTypes from 'prop-types';
import { Box, Stack, Group, Text, TextInput, ColorSwatch } from '@mantine/core';
import { TeamColorPicker, PREDEFINED_COLORS } from './TeamColorPicker';
import { FormActionButtons } from '../global';

export function TeamCreateForm({
  newTeamName,
  setNewTeamName,
  newTeamColor,
  setNewTeamColor,
  usedNames,
  usedColors,
  isLoading,
  onSubmit,
}) {
  const isNameInUse =
    usedNames.has(newTeamName.toLowerCase().trim()) && newTeamName.trim();

  return (
    <Box>
      <Text size="sm" fw={600} mb="sm">
        Create New Team
      </Text>
      <form onSubmit={onSubmit}>
        <Stack gap="sm">
          <TextInput
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name"
            size="sm"
            disabled={isLoading}
            error={isNameInUse ? 'This name is already in use' : null}
          />

          <Box>
            <Text size="xs" c="dimmed" mb="xs">
              Choose a color (required):
            </Text>
            <TeamColorPicker
              selectedColor={newTeamColor}
              usedColors={usedColors}
              onColorSelect={setNewTeamColor}
              size={32}
              showLabel={false}
              showSelected={false}
            />
          </Box>

          <Group justify="space-between">
            {newTeamColor ? (
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  Selected:
                </Text>
                <ColorSwatch color={newTeamColor} size={20} />
                <Text size="xs" fw={500}>
                  {newTeamColor}
                </Text>
              </Group>
            ) : (
              <Text size="xs" c="dimmed">
                No color selected
              </Text>
            )}
            <FormActionButtons
              onSubmit={onSubmit}
              disabled={
                !newTeamName.trim() || !newTeamColor || isNameInUse || isLoading
              }
              loading={isLoading}
              size="sm"
              submitColor="green"
              submitLabel="Create"
              singleButton
            />
          </Group>
        </Stack>
      </form>
    </Box>
  );
}

TeamCreateForm.propTypes = {
  newTeamName: PropTypes.string.isRequired,
  setNewTeamName: PropTypes.func.isRequired,
  newTeamColor: PropTypes.string.isRequired,
  setNewTeamColor: PropTypes.func.isRequired,
  usedNames: PropTypes.instanceOf(Set).isRequired,
  usedColors: PropTypes.instanceOf(Set).isRequired,
  isLoading: PropTypes.bool,
  onSubmit: PropTypes.func.isRequired,
};
