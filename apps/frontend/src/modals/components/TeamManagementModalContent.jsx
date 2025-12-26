/**
 * Team management modal content component
 * Manages team creation, editing, deletion, and reordering
 * @module modals/components/TeamManagementModalContent
 */

import { lazy, Suspense, useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Box, Stack, Text, Divider, Group, CloseButton } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import {
  LoadingState,
  UnsavedChangesOverlay,
  ConfirmDialog,
} from '../../components/global';
import { useUnsavedChangesGuard } from '../../hooks/modals';
import { useTeamManagement } from '../../hooks/useTeamManagement';
import PropTypes from 'prop-types';
const TeamCreateForm = lazy(() =>
  import('../../components/teams/TeamCreateForm').then((m) => ({
    default: m.TeamCreateForm,
  })),
);
const TeamListItem = lazy(() =>
  import('../../components/teams/TeamListItem').then((m) => ({
    default: m.TeamListItem,
  })),
);
import { teamService } from '../../services/teamService';
import { notificationAPI } from '../../utils/notificationAPI.jsx';
import logger from '../../utils/logger';

/**
 * TeamManagementModalContent
 * Content component for team management modal
 * Now uses useVisibleTeams hook directly to be reactive to SSE events
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Modal ID for closing
 * @returns {JSX.Element} Modal content
 */
function TeamManagementModalContent({ id }) {
  const {
    editingId,
    editingName,
    setEditingName,
    editingColor,
    isLoading,
    teamsArray,
    usedColors,
    usedNames,
    editingRef,
    handleCreateTeam,
    handleUpdateName,
    handleColorClick,
    handleSaveColorChange,
    handleDelete,
    startEditingColor,
    cancelEditing,
    isNameUsed,
    hasUnsavedInlineEdits,
  } = useTeamManagement();

  // Track if create form has unsaved changes
  const [createFormDirty, setCreateFormDirty] = useState(false);

  // Callback to receive dirty state from TeamCreateForm
  const handleCreateFormDirtyChange = useCallback((isDirty) => {
    setCreateFormDirty(isDirty);
  }, []);

  // Combined unsaved changes check
  const hasUnsavedChanges = createFormDirty || hasUnsavedInlineEdits;

  // Guard against closing with unsaved changes
  const { showConfirmation, requestAction, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard(hasUnsavedChanges);

  // Handle close button click with unsaved changes check
  const handleCloseClick = () => {
    if (requestAction(() => modals.close(id))) {
      modals.close(id);
    }
  };

  // Handle delete with confirmation modal
  const handleDeleteTeam = (team) => {
    ConfirmDialog.delete({
      title: 'Delete Team',
      message: `Are you sure you want to delete "${team.name}"? All analyses will be moved to Uncategorized.`,
      onConfirm: () => handleDelete(team.id),
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over.id && !isLoading) {
      const oldIndex = teamsArray.findIndex((d) => d.id === active.id);
      const newIndex = teamsArray.findIndex((d) => d.id === over.id);
      const newOrder = arrayMove(teamsArray, oldIndex, newIndex);

      try {
        await notificationAPI.executeWithNotification(
          teamService.reorderTeams(newOrder.map((d) => d.id)),
          {
            loading: 'Reordering teams...',
            success: 'Teams reordered successfully.',
          },
        );
      } catch (error) {
        logger.error('Error reordering teams:', error);
      }
    }
  };

  return (
    <Suspense
      fallback={
        <LoadingState
          loading={true}
          skeleton
          pattern="form"
          skeletonCount={3}
        />
      }
    >
      <Stack style={{ position: 'relative' }}>
        {/* Unsaved changes confirmation overlay */}
        {showConfirmation && (
          <UnsavedChangesOverlay
            onConfirm={confirmDiscard}
            onCancel={cancelDiscard}
            message="You have unsaved changes to your teams. Are you sure you want to discard them?"
          />
        )}

        {/* Custom Modal Header */}
        <Group gap="xs" justify="space-between" mb="md">
          <Group gap="xs">
            <IconUsers size={20} aria-hidden="true" />
            <Text fw={600} size="lg">
              Manage Teams
            </Text>
          </Group>
          <CloseButton
            onClick={handleCloseClick}
            size="lg"
            aria-label="Close team management"
          />
        </Group>

        {/* Create New Team */}
        <TeamCreateForm
          usedNames={usedNames}
          usedColors={usedColors}
          isLoading={isLoading}
          onSubmit={handleCreateTeam}
          onDirtyChange={handleCreateFormDirtyChange}
        />

        <Divider />

        {/* Existing Teams */}
        <Box>
          <Text size="sm" fw={600} mb="sm">
            Existing Teams
          </Text>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={teamsArray.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap="xs">
                {teamsArray.map((team) => (
                  <TeamListItem
                    key={team.id}
                    team={team}
                    editingId={editingId}
                    editingName={editingName}
                    setEditingName={setEditingName}
                    editingColor={editingColor}
                    usedColors={usedColors}
                    isLoading={isLoading}
                    isNameInUse={isNameUsed(editingName, team.id)}
                    onColorClick={handleColorClick}
                    onSaveColorChange={handleSaveColorChange}
                    onUpdateName={handleUpdateName}
                    onStartEdit={startEditingColor}
                    onCancelEdit={cancelEditing}
                    onDelete={() => handleDeleteTeam(team)}
                    editingRef={editingRef}
                  />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>
        </Box>
      </Stack>
    </Suspense>
  );
}

TeamManagementModalContent.propTypes = {
  id: PropTypes.string.isRequired,
};

export default TeamManagementModalContent;
