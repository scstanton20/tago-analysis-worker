/**
 * Team list item component
 * Displays a team with edit, delete, and display modes
 * @module components/teams/TeamListItem
 */

import PropTypes from 'prop-types';
import {
  Paper,
  Stack,
  Group,
  Text,
  TextInput,
  ActionIcon,
  ColorSwatch,
  Box,
} from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useEnterKeySubmit } from '../../hooks/forms/useEnterKeySubmit';
import { TeamColorPicker } from './TeamColorPicker';
import { PrimaryButton, CancelButton } from '../global';

/**
 * Team list item in display mode
 */
function TeamDisplayMode({ team, isLoading, onEdit, onDelete }) {
  return (
    <Group gap="sm">
      <ColorSwatch color={team.color} size={20} />
      <Text size="sm" style={{ flex: 1 }}>
        {team.name}
      </Text>
      {!team.isSystem && (
        <Group gap={4}>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => onEdit(team)}
            disabled={isLoading}
            aria-label={`Edit ${team.name}`}
          >
            <IconEdit size={16} aria-hidden="true" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="red"
            onClick={() => onDelete(team.id)}
            disabled={isLoading}
            aria-label={`Delete ${team.name}`}
          >
            <IconTrash size={16} aria-hidden="true" />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
}

TeamDisplayMode.propTypes = {
  team: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
    isSystem: PropTypes.bool,
  }).isRequired,
  isLoading: PropTypes.bool,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

/**
 * Team list item in editing mode
 */
function TeamEditMode({
  team,
  editingName,
  setEditingName,
  editingColor,
  usedColors,
  isLoading,
  isNameInUse,
  onColorClick,
  onSaveColorChange,
  onUpdateName,
  onCancel,
  editingRef,
}) {
  const hasColorChanged = editingColor && editingColor !== team.color;
  const hasNameChanged = editingName !== team.name;

  const handleKeyDown = useEnterKeySubmit(() => onUpdateName(team.id), {
    onEscape: onCancel,
  });

  return (
    <Stack gap="sm" ref={editingRef}>
      <TextInput
        value={editingName}
        onChange={(e) => setEditingName(e.target.value)}
        onKeyDown={handleKeyDown}
        size="sm"
        disabled={isLoading}
        error={isNameInUse ? 'This name is already in use' : null}
      />

      <Box>
        <TeamColorPicker
          selectedColor={editingColor}
          usedColors={usedColors}
          excludeColor={team.color}
          onColorSelect={onColorClick}
          size={28}
          showLabel={true}
          showSelected={false}
        />
      </Box>

      <Group justify="space-between">
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {editingColor ? 'Preview:' : 'Current:'}
          </Text>
          <ColorSwatch color={editingColor || team.color} size={16} />
          <Text size="xs" fw={500}>
            {editingColor || team.color}
          </Text>
        </Group>
        <Group gap="xs">
          <CancelButton
            size="xs"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </CancelButton>
          {hasColorChanged && (
            <PrimaryButton
              size="xs"
              onClick={() => onSaveColorChange(team.id)}
              loading={isLoading}
              disabled={isLoading}
            >
              Save
            </PrimaryButton>
          )}
          {hasNameChanged && (
            <PrimaryButton
              size="xs"
              onClick={() => onUpdateName(team.id)}
              loading={isLoading}
              disabled={isLoading}
            >
              Save Name
            </PrimaryButton>
          )}
        </Group>
      </Group>
    </Stack>
  );
}

TeamEditMode.propTypes = {
  team: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
  }).isRequired,
  editingName: PropTypes.string.isRequired,
  setEditingName: PropTypes.func.isRequired,
  editingColor: PropTypes.string,
  usedColors: PropTypes.instanceOf(Set).isRequired,
  isLoading: PropTypes.bool,
  isNameInUse: PropTypes.bool,
  onColorClick: PropTypes.func.isRequired,
  onSaveColorChange: PropTypes.func.isRequired,
  onUpdateName: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  editingRef: PropTypes.object,
};

// TeamDeleteMode removed - now using Mantine's modals.openConfirmModal()

/**
 * Main team list item component that switches between modes
 */
export function TeamListItem({
  team,
  editingId,
  editingName,
  setEditingName,
  editingColor,
  usedColors,
  isLoading,
  isNameInUse,
  onColorClick,
  onSaveColorChange,
  onUpdateName,
  onStartEdit,
  onCancelEdit,
  onDelete,
  editingRef,
}) {
  const isEditing = editingId === team.id;

  return (
    <Paper key={team.id} p="sm" withBorder>
      {isEditing ? (
        <TeamEditMode
          team={team}
          editingName={editingName}
          setEditingName={setEditingName}
          editingColor={editingColor}
          usedColors={usedColors}
          isLoading={isLoading}
          isNameInUse={isNameInUse}
          onColorClick={onColorClick}
          onSaveColorChange={onSaveColorChange}
          onUpdateName={onUpdateName}
          onCancel={onCancelEdit}
          editingRef={editingRef}
        />
      ) : (
        <TeamDisplayMode
          team={team}
          isLoading={isLoading}
          onEdit={onStartEdit}
          onDelete={onDelete}
        />
      )}
    </Paper>
  );
}

TeamListItem.propTypes = {
  team: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
    isSystem: PropTypes.bool,
  }).isRequired,
  editingId: PropTypes.string,
  editingName: PropTypes.string,
  setEditingName: PropTypes.func.isRequired,
  editingColor: PropTypes.string,
  usedColors: PropTypes.instanceOf(Set).isRequired,
  isLoading: PropTypes.bool,
  isNameInUse: PropTypes.bool,
  onColorClick: PropTypes.func.isRequired,
  onSaveColorChange: PropTypes.func.isRequired,
  onUpdateName: PropTypes.func.isRequired,
  onStartEdit: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  editingRef: PropTypes.object,
};
