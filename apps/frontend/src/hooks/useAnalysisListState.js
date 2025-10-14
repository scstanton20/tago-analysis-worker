/**
 * Custom hook for managing analysis list state
 * Handles log toggles, folder modals, and team utilities
 * @module hooks/useAnalysisListState
 */

import { useState, useCallback } from 'react';
import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import logger from '../utils/logger';
import teamService from '../services/teamService';

/**
 * Hook for managing analysis list state
 * @param {Object} params - Hook parameters
 * @param {Array} params.analysesArray - Array of analyses
 * @param {Function} params.getTeam - Function to get team by ID
 * @param {string} params.selectedTeam - Selected team ID
 * @returns {Object} State and handlers
 */
export function useAnalysisListState({ analysesArray, getTeam, selectedTeam }) {
  const [openLogIds, setOpenLogIds] = useState(new Set());
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [currentFolder, setCurrentFolder] = useState(null);

  /**
   * Get team info for display
   */
  const getTeamInfo = useCallback(
    (teamId) => {
      if (!teamId || teamId === 'uncategorized') {
        return { name: 'Uncategorized', color: '#9ca3af' };
      }

      const team = getTeam(teamId);
      if (team) {
        return team;
      }

      // Fallback for missing teams
      logger.warn(`Team ${teamId} not found`);
      return { name: 'Unknown Team', color: '#ef4444' };
    },
    [getTeam],
  );

  /**
   * Toggle all logs open/closed
   */
  const toggleAllLogs = useCallback(() => {
    if (openLogIds.size === analysesArray.length) {
      setOpenLogIds(new Set());
    } else {
      setOpenLogIds(new Set(analysesArray.map((analysis) => analysis.name)));
    }
  }, [openLogIds.size, analysesArray]);

  /**
   * Toggle a single analysis log
   */
  const toggleLog = useCallback((analysisName) => {
    setOpenLogIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(analysisName)) {
        newSet.delete(analysisName);
      } else {
        newSet.add(analysisName);
      }
      return newSet;
    });
  }, []);

  /**
   * Open folder creation modal
   */
  const handleCreateFolder = useCallback((parentFolder = null) => {
    setCurrentFolder(parentFolder);
    setFolderModalOpen(true);
  }, []);

  /**
   * Close folder creation modal
   */
  const handleCloseFolderModal = useCallback(() => {
    setFolderModalOpen(false);
    setCurrentFolder(null);
  }, []);

  /**
   * Close rename modal
   */
  const handleCloseRenameModal = useCallback(() => {
    setRenameModalOpen(false);
    setCurrentFolder(null);
  }, []);

  /**
   * Handle folder actions (rename, delete, create subfolder)
   */
  const handleFolderAction = useCallback(
    async (action, folder) => {
      switch (action) {
        case 'createSubfolder':
          handleCreateFolder(folder);
          break;

        case 'rename':
          setCurrentFolder(folder);
          setRenameModalOpen(true);
          break;

        case 'delete':
          modals.openConfirmModal({
            title: 'Delete Folder',
            children: (
              <Text size="sm">
                Are you sure you want to delete "{folder.name}"? All items
                inside will be moved to the parent folder.
              </Text>
            ),
            labels: { confirm: 'Delete', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
              try {
                await teamService.deleteFolder(selectedTeam, folder.id);
                notifications.show({
                  title: 'Success',
                  message: `Folder "${folder.name}" deleted`,
                  color: 'green',
                });
              } catch (error) {
                notifications.show({
                  title: 'Error',
                  message: error.message || 'Failed to delete folder',
                  color: 'red',
                });
              }
            },
          });
          break;

        default:
          logger.warn('Unknown folder action:', action);
      }
    },
    [selectedTeam, handleCreateFolder],
  );

  return {
    openLogIds,
    folderModalOpen,
    renameModalOpen,
    currentFolder,
    getTeamInfo,
    toggleAllLogs,
    toggleLog,
    handleCreateFolder,
    handleCloseFolderModal,
    handleCloseRenameModal,
    handleFolderAction,
  };
}
