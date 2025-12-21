/**
 * Team management modal content component
 * Manages team creation, editing, deletion, and reordering
 * @module modals/components/TeamManagementModalContent
 */

import { lazy, Suspense } from 'react';
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
import { Box, Stack, Text, Divider } from '@mantine/core';
import { modals } from '@mantine/modals';
import { LoadingState } from '../../components/global';
import { useTeamManagement } from '../../hooks/useTeamManagement';
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
 * @returns {JSX.Element} Modal content
 */
function TeamManagementModalContent() {
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
  } = useTeamManagement();

  // Handle delete with confirmation modal
  const handleDeleteTeam = (team) => {
    modals.openConfirmModal({
      title: 'Delete Team',
      children: `Are you sure you want to delete "${team.name}"? All analyses will be moved to Uncategorized.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
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
      <Stack>
        {/* Create New Team */}
        <TeamCreateForm
          usedNames={usedNames}
          usedColors={usedColors}
          isLoading={isLoading}
          onSubmit={handleCreateTeam}
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

export default TeamManagementModalContent;
