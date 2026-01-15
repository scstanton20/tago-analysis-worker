import { useState, useCallback } from 'react';
import { teamService } from '@/features/teams/api/teamService';
import { notificationAPI } from '@/utils/notificationService.jsx';
import logger from '@/utils/logger';
import {
  applyReorderToStructure,
  addPendingFolderToStructure,
} from '@/utils/reorderUtils';

/**
 * Hook for managing reorder mode state and operations in the analysis list.
 * Handles pending reorders, folder creation, and applying changes to the team structure.
 *
 * @param {Object} options - Hook options
 * @param {string} options.selectedTeam - Currently selected team ID
 * @param {Object} options.teamStructure - Current team structure from SSE context
 * @returns {Object} Reorder mode state and handlers
 */
export function useReorderMode({ selectedTeam, teamStructure }) {
  const [reorderMode, setReorderMode] = useState(false);
  const [pendingReorders, setPendingReorders] = useState([]);
  const [localStructure, setLocalStructure] = useState(null);
  const [pendingFolders, setPendingFolders] = useState([]);
  const [pendingFolderDeletions, setPendingFolderDeletions] = useState([]);

  /**
   * Create a pending folder in reorder mode (not persisted until apply)
   * @param {Object} folderInfo - Folder info with name and parentFolderId
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

      // Add to local structure using the utility function
      setLocalStructure((prev) =>
        addPendingFolderToStructure(prev, folderInfo, tempId, selectedTeam),
      );
    },
    [selectedTeam],
  );

  /**
   * Handle a pending reorder operation (applies to local structure only)
   * @param {Object} reorderInfo - Reorder info with itemId, targetParentId, targetIndex
   */
  const handlePendingReorder = useCallback(
    (reorderInfo) => {
      setPendingReorders((prev) => [...prev, reorderInfo]);
      setLocalStructure((prev) =>
        applyReorderToStructure(prev, reorderInfo, selectedTeam),
      );
    },
    [selectedTeam],
  );

  /**
   * Cancel reorder mode and discard all pending changes
   */
  const handleCancelReorder = useCallback(() => {
    setPendingReorders([]);
    setPendingFolders([]);
    setPendingFolderDeletions([]);
    setReorderMode(false);
    setLocalStructure(null);
  }, []);

  /**
   * Apply all pending changes (folder deletions, folder creations, reorders)
   */
  const handleApplyReorders = useCallback(async () => {
    if (
      pendingReorders.length === 0 &&
      pendingFolders.length === 0 &&
      pendingFolderDeletions.length === 0
    ) {
      setReorderMode(false);
      setLocalStructure(null);
      return;
    }

    try {
      for (const folderId of pendingFolderDeletions) {
        await teamService.deleteFolder(selectedTeam, folderId);
      }

      const folderIdMap = {};
      for (const folder of pendingFolders) {
        const result = await teamService.createFolder(selectedTeam, {
          name: folder.name,
          parentFolderId: folder.parentFolderId
            ? folderIdMap[folder.parentFolderId] || folder.parentFolderId
            : undefined,
        });
        folderIdMap[folder.tempId] = result.id;
      }

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

      notificationAPI.success('Changes applied successfully');

      setPendingReorders([]);
      setPendingFolders([]);
      setPendingFolderDeletions([]);
      setReorderMode(false);
      setLocalStructure(null);
    } catch (error) {
      logger.error('Failed to apply changes:', error);
      notificationAPI.error(error.message || 'Failed to apply changes');
    }
  }, [pendingReorders, pendingFolders, pendingFolderDeletions, selectedTeam]);

  /**
   * Enter reorder mode with a snapshot of the current team structure
   */
  const enterReorderMode = useCallback(() => {
    setLocalStructure(structuredClone(teamStructure));
    setReorderMode(true);
  }, [teamStructure]);

  /**
   * Mark a folder for deletion in reorder mode
   * @param {Object} folder - Folder to delete with id and name
   */
  const handlePendingFolderDeletion = useCallback(
    (folder) => {
      const isTempFolder = folder.id.startsWith('temp-');

      if (!isTempFolder) {
        setPendingFolderDeletions((prev) => [...prev, folder.id]);
      } else {
        setPendingFolders((prev) => prev.filter((f) => f.tempId !== folder.id));
      }

      setLocalStructure((prev) => {
        const newStructure = structuredClone(prev);
        const items = newStructure?.[selectedTeam]?.items || [];

        const removeFolder = (itemsList) => {
          for (let i = 0; i < itemsList.length; i++) {
            const item = itemsList[i];
            if (item.id === folder.id) {
              const folderItems = item.items || [];
              itemsList.splice(i, 1, ...folderItems);
              return true;
            }
            if (item.type === 'folder' && item.items) {
              if (removeFolder(item.items)) return true;
            }
          }
          return false;
        };

        removeFolder(items);
        return newStructure;
      });

      notificationAPI.info(
        isTempFolder
          ? `"${folder.name}" removed from preview`
          : `"${folder.name}" will be deleted when you click Done`,
        isTempFolder ? 'Folder Removed' : 'Folder Marked for Deletion',
      );
    },
    [selectedTeam],
  );

  return {
    // State
    reorderMode,
    pendingReorders,
    localStructure,
    pendingFolders,
    pendingFolderDeletions,
    // Handlers
    handleCreatePendingFolder,
    handlePendingReorder,
    handleCancelReorder,
    handleApplyReorders,
    enterReorderMode,
    handlePendingFolderDeletion,
  };
}

export default useReorderMode;
