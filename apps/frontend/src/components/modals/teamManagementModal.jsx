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
    deletingId,
    setDeletingId,
    isLoading,
    teamsArray,
    usedColors,
    usedNames,
    editingRef,
    deletingRef,
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
                    deletingId={deletingId}
                    usedColors={usedColors}
                    isLoading={isLoading}
                    isNameInUse={isNameUsed(editingName, team.id)}
                    onColorClick={handleColorClick}
                    onSaveColorChange={handleSaveColorChange}
                    onUpdateName={handleUpdateName}
                    onStartEdit={startEditingColor}
                    onCancelEdit={cancelEditing}
                    onStartDelete={setDeletingId}
                    onCancelDelete={() => setDeletingId(null)}
                    onConfirmDelete={handleDelete}
                    editingRef={editingRef}
                    deletingRef={deletingRef}
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
