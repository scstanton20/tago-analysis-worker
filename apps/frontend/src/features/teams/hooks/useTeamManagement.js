/**
 * Custom hook for team management operations
 * Handles team creation, updating, deletion, and reordering
 * @module hooks/useTeamManagement
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import { notificationAPI } from '@/utils/notificationAPI.jsx';
import { useAsyncOperation } from '@/hooks/async';
import { useTeams } from '@/contexts/sseContext/index';
import logger from '@/utils/logger';
import { teamService } from '../api/teamService';

/**
 * Hook for managing team operations
 * Gets teams directly from SSE context
 * @returns {Object} State and handlers for team management
 */
export function useTeamManagement() {
  // Get teams from SSE context
  const { teams } = useTeams();
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('');

  // Async operations
  const createTeamOperation = useAsyncOperation({
    onError: (error) => logger.error('Error creating team:', error),
  });

  const updateNameOperation = useAsyncOperation({
    onError: (error) => logger.error('Error updating team name:', error),
  });

  const updateColorOperation = useAsyncOperation({
    onError: (error) => logger.error('Error updating team color:', error),
  });

  const deleteTeamOperation = useAsyncOperation({
    onError: (error) => logger.error('Error deleting team:', error),
  });

  // Combined loading state from all operations
  const isLoading =
    createTeamOperation.loading ||
    updateNameOperation.loading ||
    updateColorOperation.loading ||
    deleteTeamOperation.loading;

  // Ref for click outside functionality in edit mode
  const editingRef = useRef();

  // Convert teams object to sorted array for display
  const teamsArray = useMemo(
    () => Object.values(teams).sort((a, b) => a.order - b.order),
    [teams],
  );

  // Get used colors and names
  const usedColors = useMemo(
    () => new Set(teamsArray.map((team) => team.color)),
    [teamsArray],
  );

  const usedNames = useMemo(
    () => new Set(teamsArray.map((team) => team.name.toLowerCase().trim())),
    [teamsArray],
  );

  /**
   * Create a new team
   * @param {Object} values - Form values from TeamCreateForm
   * @param {string} values.name - Team name
   * @param {string} values.color - Team color
   * @returns {Promise<boolean>} Returns true if team creation was successful
   */
  const handleCreateTeam = useCallback(
    async (values) => {
      if (!values.name?.trim() || !values.color || isLoading) return false;

      // Check for duplicate name
      if (usedNames.has(values.name.toLowerCase().trim())) {
        notificationAPI.error(
          'A team with this name already exists. Please choose a different name.',
        );
        return false;
      }

      await createTeamOperation.execute(async () => {
        await notificationAPI.createTeam(
          teamService.createTeam(values.name.trim(), values.color),
          values.name.trim(),
        );
      });

      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [isLoading, usedNames, createTeamOperation.execute],
  );

  /**
   * Update team name
   */
  const handleUpdateName = useCallback(
    async (id) => {
      const currentTeam = teamsArray.find((d) => d.id === id);
      if (
        !editingName.trim() ||
        editingName === currentTeam?.name ||
        isLoading
      ) {
        setEditingId(null);
        return;
      }

      // Check for duplicate name (excluding current team)
      const otherNames = new Set(
        teamsArray
          .filter((team) => team.id !== id)
          .map((team) => team.name.toLowerCase().trim()),
      );

      if (otherNames.has(editingName.toLowerCase().trim())) {
        notificationAPI.error(
          'A team with this name already exists. Please choose a different name.',
        );
        return;
      }

      await updateNameOperation.execute(async () => {
        await notificationAPI.updateTeam(
          teamService.updateTeam(id, {
            name: editingName.trim(),
          }),
          editingName.trim(),
        );
        setEditingId(null);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [editingName, teamsArray, isLoading, updateNameOperation.execute],
  );

  /**
   * Update local editing color (doesn't make API call)
   */
  const handleColorClick = (color) => {
    setEditingColor(color);
  };

  /**
   * Save color change to API
   */
  const handleSaveColorChange = useCallback(
    async (id) => {
      if (!editingColor || isLoading) {
        setEditingId(null);
        setEditingColor('');
        return;
      }

      await updateColorOperation.execute(async () => {
        const currentTeam = teamsArray.find((d) => d.id === id);
        await notificationAPI.executeWithNotification(
          teamService.updateTeam(id, { color: editingColor }),
          {
            loading: `Updating ${currentTeam?.name || 'team'} color...`,
            success: 'Team color updated successfully.',
          },
        );
        setEditingId(null);
        setEditingColor('');
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [editingColor, isLoading, teamsArray, updateColorOperation.execute],
  );

  /**
   * Delete a team
   * Note: Confirmation is now handled by Mantine's modals.openConfirmModal()
   */
  const handleDelete = useCallback(
    async (id) => {
      if (isLoading) return;

      await deleteTeamOperation.execute(async () => {
        const currentTeam = teamsArray.find((d) => d.id === id);
        await notificationAPI.deleteTeam(
          teamService.deleteTeam(id, 'uncategorized'),
          currentTeam?.name || 'team',
        );
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [isLoading, teamsArray, deleteTeamOperation.execute],
  );

  // Note: handleDragEnd is implemented in the component since it uses arrayMove from dnd-kit

  /**
   * Start editing a team's color
   */
  const startEditingColor = useCallback((team) => {
    setEditingId(team.id);
    setEditingName(team.name);
    setEditingColor(team.color);
  }, []);

  /**
   * Cancel editing
   */
  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditingColor('');
  }, []);

  /**
   * Reset all form state
   */
  const resetState = useCallback(() => {
    setEditingId(null);
    setEditingName('');
    setEditingColor('');
  }, []);

  /**
   * Check if a name is already in use (for validation)
   */
  const isNameUsed = useCallback(
    (name, excludeId = null) => {
      const trimmed = name.toLowerCase().trim();
      if (!trimmed) return false;

      return teamsArray.some(
        (team) =>
          team.id !== excludeId && team.name.toLowerCase().trim() === trimmed,
      );
    },
    [teamsArray],
  );

  /**
   * Check if there are unsaved inline edits
   * Returns true if a team is being edited and the values differ from original
   */
  const hasUnsavedInlineEdits = useMemo(() => {
    if (!editingId) return false;

    const currentTeam = teamsArray.find((t) => t.id === editingId);
    if (!currentTeam) return false;

    // Check if name or color has changed from original
    const nameChanged = editingName !== currentTeam.name;
    const colorChanged = editingColor !== currentTeam.color;

    return nameChanged || colorChanged;
  }, [editingId, editingName, editingColor, teamsArray]);

  return {
    // State
    editingId,
    setEditingId,
    editingName,
    setEditingName,
    editingColor,
    setEditingColor,
    isLoading,

    // Computed values
    teamsArray,
    usedColors,
    usedNames,

    // Refs
    editingRef,

    // Handlers
    handleCreateTeam,
    handleUpdateName,
    handleColorClick,
    handleSaveColorChange,
    handleDelete,
    startEditingColor,
    cancelEditing,
    resetState,
    isNameUsed,
    hasUnsavedInlineEdits,
  };
}
