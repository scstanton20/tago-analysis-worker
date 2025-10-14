/**
 * Custom hook for managing analysis list reorder mode
 * Handles drag-and-drop reordering, pending changes, and folder creation
 * @module hooks/useAnalysisListReorder
 */

import { useState, useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import logger from '../utils/logger';
import teamService from '../services/teamService';
import {
  applyReorderToStructure,
  addPendingFolderToStructure,
} from '../utils/reorderUtils';

/**
 * Hook for managing analysis list reorder operations
 * @param {string} selectedTeam - Current team ID
 * @param {Object} teamStructure - Current team structure from SSE
 * @returns {Object} Reorder state and handlers
 */
export function useAnalysisListReorder(selectedTeam, teamStructure) {
  const [reorderMode, setReorderMode] = useState(false);
  const [pendingReorders, setPendingReorders] = useState([]);
  const [reorderModeKey, setReorderModeKey] = useState(0);
  const [localStructure, setLocalStructure] = useState(null);
  const [pendingFolders, setPendingFolders] = useState([]);

  /**
   * Handle creating a pending folder in reorder mode
   */
  const handleCreatePendingFolder = useCallback(
    (folderInfo) => {
      const tempId = `temp-${crypto.randomUUID()}`;

      // Add to pending folders list
      setPendingFolders((prev) => [
        ...prev,
        {
          tempId,
          name: folderInfo.name,
          parentFolderId: folderInfo.parentFolderId,
        },
      ]);

      // Add to local structure
      setLocalStructure((prev) =>
        addPendingFolderToStructure(prev, folderInfo, tempId, selectedTeam),
      );

      // Restart animations
      setReorderModeKey((prev) => prev + 1);
    },
    [selectedTeam],
  );

  /**
   * Handle adding a pending reorder operation
   */
  const handlePendingReorder = useCallback(
    (reorderInfo) => {
      setPendingReorders((prev) => [...prev, reorderInfo]);
      // Apply to local structure immediately
      setLocalStructure((prev) =>
        applyReorderToStructure(prev, reorderInfo, selectedTeam),
      );
    },
    [selectedTeam],
  );

  /**
   * Cancel reorder mode and discard changes
   */
  const handleCancelReorder = useCallback(() => {
    setPendingReorders([]);
    setPendingFolders([]);
    setReorderMode(false);
    setReorderModeKey(0);
    setLocalStructure(null);
  }, []);

  /**
   * Apply all pending reorders and folder creations
   */
  const handleApplyReorders = useCallback(async () => {
    if (pendingReorders.length === 0 && pendingFolders.length === 0) {
      setReorderMode(false);
      setReorderModeKey(0);
      setLocalStructure(null);
      return;
    }

    try {
      // First, create all pending folders
      const folderIdMap = {}; // Map temp IDs to real IDs
      for (const folder of pendingFolders) {
        const result = await teamService.createFolder(selectedTeam, {
          name: folder.name,
          parentFolderId: folder.parentFolderId
            ? folderIdMap[folder.parentFolderId] || folder.parentFolderId
            : undefined,
        });
        folderIdMap[folder.tempId] = result.id;
      }

      // Then apply all pending reorders (replacing temp IDs with real ones)
      for (const reorder of pendingReorders) {
        await teamService.moveItem(
          selectedTeam,
          folderIdMap[reorder.itemId] || reorder.itemId,
          reorder.targetParentId
            ? folderIdMap[reorder.targetParentId] || reorder.targetParentId
            : reorder.targetParentId,
          reorder.targetIndex,
        );
      }

      notifications.show({
        title: 'Success',
        message: 'Changes applied successfully',
        color: 'green',
      });

      setPendingReorders([]);
      setPendingFolders([]);
      setReorderMode(false);
      setReorderModeKey(0);
      setLocalStructure(null);
    } catch (error) {
      logger.error('Failed to apply changes:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to apply changes',
        color: 'red',
      });
    }
  }, [pendingReorders, pendingFolders, selectedTeam]);

  /**
   * Enter reorder mode
   */
  const handleStartReorder = useCallback(() => {
    // Capture current structure for local editing
    setLocalStructure(structuredClone(teamStructure));
    setReorderMode(true);
    setReorderModeKey((prev) => prev + 1);
  }, [teamStructure]);

  return {
    reorderMode,
    reorderModeKey,
    localStructure,
    pendingReorders,
    pendingFolders,
    handleCreatePendingFolder,
    handlePendingReorder,
    handleCancelReorder,
    handleApplyReorders,
    handleStartReorder,
  };
}
