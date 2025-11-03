/**
 * Custom hook for team management operations
 * Handles team creation, updating, deletion, and reordering
 * @module hooks/useTeamManagement
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import { teamService } from '../services/teamService';
import { useNotifications } from './useNotifications.jsx';
import logger from '../utils/logger';

/**
 * Hook for managing team operations
 * @param {Object} params - Hook parameters
 * @param {Object} params.teams - Teams object
 * @returns {Object} State and handlers for team management
 */
export function useTeamManagement({ teams }) {
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const notify = useNotifications();

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
   */
  const handleCreateTeam = useCallback(
    async (e) => {
      e.preventDefault();
      if (!newTeamName.trim() || !newTeamColor || isLoading) return;

      // Check for duplicate name
      if (usedNames.has(newTeamName.toLowerCase().trim())) {
        notify.error(
          'A team with this name already exists. Please choose a different name.',
        );
        return;
      }

      setIsLoading(true);
      try {
        await notify.createTeam(
          teamService.createTeam(newTeamName.trim(), newTeamColor),
          newTeamName.trim(),
        );
        setNewTeamName('');
        setNewTeamColor('');
      } catch (error) {
        logger.error('Error creating team:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [newTeamName, newTeamColor, isLoading, usedNames, notify],
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
        notify.error(
          'A team with this name already exists. Please choose a different name.',
        );
        return;
      }

      setIsLoading(true);
      try {
        await notify.updateTeam(
          teamService.updateTeam(id, {
            name: editingName.trim(),
          }),
          editingName.trim(),
        );
        setEditingId(null);
      } catch (error) {
        logger.error('Error updating team name:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [editingName, teamsArray, isLoading, notify],
  );

  /**
   * Update local editing color (doesn't make API call)
   */
  const handleColorClick = useCallback((color) => {
    setEditingColor(color);
  }, []);

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

      setIsLoading(true);
      try {
        const currentTeam = teamsArray.find((d) => d.id === id);
        await notify.executeWithNotification(
          teamService.updateTeam(id, { color: editingColor }),
          {
            loading: `Updating ${currentTeam?.name || 'team'} color...`,
            success: 'Team color updated successfully.',
          },
        );
        setEditingId(null);
        setEditingColor('');
      } catch (error) {
        logger.error('Error updating team color:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [editingColor, isLoading, teamsArray, notify],
  );

  /**
   * Delete a team
   * Note: Confirmation is now handled by Mantine's modals.openConfirmModal()
   */
  const handleDelete = useCallback(
    async (id) => {
      if (isLoading) return;

      setIsLoading(true);
      try {
        const currentTeam = teamsArray.find((d) => d.id === id);
        await notify.deleteTeam(
          teamService.deleteTeam(id, 'uncategorized'),
          currentTeam?.name || 'team',
        );
      } catch (error) {
        logger.error('Error deleting team:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, teamsArray, notify],
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
    setNewTeamName('');
    setNewTeamColor('');
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

  return {
    // State
    newTeamName,
    setNewTeamName,
    newTeamColor,
    setNewTeamColor,
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
  };
}
