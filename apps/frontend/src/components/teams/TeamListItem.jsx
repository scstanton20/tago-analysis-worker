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
  Button,
  TextInput,
  ActionIcon,
  ColorSwatch,
  Box,
} from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { TeamColorPicker } from './TeamColorPicker';

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

  return (
    <Stack gap="sm" ref={editingRef}>
      <TextInput
        value={editingName}
        onChange={(e) => setEditingName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onUpdateName(team.id);
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
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
          {hasColorChanged && (
            <Button
              size="xs"
              onClick={() => onSaveColorChange(team.id)}
              loading={isLoading}
              disabled={isLoading}
            >
              Save
            </Button>
          )}
          {hasNameChanged && (
            <Button
              size="xs"
              variant="light"
              onClick={() => onUpdateName(team.id)}
              loading={isLoading}
              disabled={isLoading}
            >
              Save Name
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            onClick={onCancel}
            disabled={isLoading}
          >
            {hasColorChanged || hasNameChanged ? 'Cancel' : 'Done'}
          </Button>
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

/**
 * Team list item in delete confirmation mode
 */
function TeamDeleteMode({
  team,
  isLoading,
  onConfirmDelete,
  onCancel,
  deletingRef,
}) {
  return (
    <Stack gap="sm" ref={deletingRef}>
      <Group gap="sm" align="center">
        <ColorSwatch color={team.color} size={20} />
        <Text size="sm" style={{ flex: 1 }}>
          {team.name}
        </Text>
      </Group>
      <Paper p="sm" withBorder>
        <Text size="sm" c="red.8" mb="sm">
          Are you sure you want to delete this team? All analyses will be moved
          to Uncategorized.
        </Text>
        <Group gap="xs">
          <Button
            size="xs"
            color="red"
            onClick={() => onConfirmDelete(team.id)}
            loading={isLoading}
            disabled={isLoading}
          >
            Delete
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </Group>
      </Paper>
    </Stack>
  );
}

TeamDeleteMode.propTypes = {
  team: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
  }).isRequired,
  isLoading: PropTypes.bool,
  onConfirmDelete: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  deletingRef: PropTypes.object,
};

/**
 * Main team list item component that switches between modes
 */
export function TeamListItem({
  team,
  editingId,
  editingName,
  setEditingName,
  editingColor,
  deletingId,
  usedColors,
  isLoading,
  isNameInUse,
  onColorClick,
  onSaveColorChange,
  onUpdateName,
  onStartEdit,
  onCancelEdit,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  editingRef,
  deletingRef,
}) {
  const isEditing = editingId === team.id;
  const isDeleting = deletingId === team.id;

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
      ) : isDeleting ? (
        <TeamDeleteMode
          team={team}
          isLoading={isLoading}
          onConfirmDelete={onConfirmDelete}
          onCancel={onCancelDelete}
          deletingRef={deletingRef}
        />
      ) : (
        <TeamDisplayMode
          team={team}
          isLoading={isLoading}
          onEdit={onStartEdit}
          onDelete={onStartDelete}
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
  deletingId: PropTypes.string,
  usedColors: PropTypes.instanceOf(Set).isRequired,
  isLoading: PropTypes.bool,
  isNameInUse: PropTypes.bool,
  onColorClick: PropTypes.func.isRequired,
  onSaveColorChange: PropTypes.func.isRequired,
  onUpdateName: PropTypes.func.isRequired,
  onStartEdit: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onStartDelete: PropTypes.func.isRequired,
  onCancelDelete: PropTypes.func.isRequired,
  onConfirmDelete: PropTypes.func.isRequired,
  editingRef: PropTypes.object,
  deletingRef: PropTypes.object,
};
