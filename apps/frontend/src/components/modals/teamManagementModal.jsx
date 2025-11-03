/**
 * Team management modal component
 * Manages team creation, editing, deletion, and reordering
 * @module components/modals/teamManagementModal
 */

import PropTypes from 'prop-types';
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
import { Box, Stack, Text, Modal, Divider } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useTeamManagement } from '../../hooks/useTeamManagement';
import { TeamCreateForm } from '../teams/TeamCreateForm';
import { TeamListItem } from '../teams/TeamListItem';
import { teamService } from '../../services/teamService';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import logger from '../../utils/logger';

export default function TeamManagementModal({ opened, onClose, teams }) {
  const {
    newTeamName,
    setNewTeamName,
    newTeamColor,
    setNewTeamColor,
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
    resetState,
    isNameUsed,
  } = useTeamManagement({ teams });

  const notify = useNotifications();

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
        await notify.executeWithNotification(
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

  const handleModalClose = () => {
    resetState();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      closeOnEscape={false}
      title={
        <Text fw={600} id="team-management-modal-title">
          Manage Teams
        </Text>
      }
      size="lg"
      aria-labelledby="team-management-modal-title"
    >
      <Stack>
        {/* Create New Team */}
        <TeamCreateForm
          newTeamName={newTeamName}
          setNewTeamName={setNewTeamName}
          newTeamColor={newTeamColor}
          setNewTeamColor={setNewTeamColor}
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
    </Modal>
  );
}

TeamManagementModal.propTypes = {
  opened: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  teams: PropTypes.object.isRequired,
};
