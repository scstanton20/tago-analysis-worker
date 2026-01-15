/**
 * Custom hook for managing drag-and-drop functionality in analysis tree
 * Handles complex nested drag-and-drop with folders and analyses
 * @module hooks/useTreeDragDrop
 */

import { useState, useCallback } from 'react';
import { closestCenter, pointerWithin, rectIntersection } from '@dnd-kit/core';
import { notificationAPI } from '@/utils/notificationService';
import logger from '@/utils/logger';
import { findItemWithParent } from '@/utils/reorderUtils';
import { teamService } from '../api/teamService';

/**
 * Hook for managing tree drag-and-drop operations
 * @param {Object} params - Hook parameters
 * @param {string} params.teamId - Team ID
 * @param {Array} params.items - Tree items
 * @param {boolean} params.reorderMode - Whether reorder mode is active
 * @param {Function} params.onPendingReorder - Callback for pending reorder changes
 * @returns {Object} Drag-and-drop state and handlers
 */
export function useTreeDragDrop({
  teamId,
  items,
  reorderMode,
  onPendingReorder,
}) {
  const [activeId, setActiveId] = useState(null);

  /**
   * Check if target is a descendant of source
   */
  const isDescendant = useCallback((items, ancestorId, targetId) => {
    const checkItems = (itemList) => {
      for (const item of itemList) {
        if (item.id === targetId) return true;
        if (item.type === 'folder' && item.items) {
          if (checkItems(item.items)) return true;
        }
      }
      return false;
    };

    const ancestor = findItemWithParent(items, ancestorId);
    if (!ancestor || !ancestor.item.items) return false;
    return checkItems(ancestor.item.items);
  }, []);

  /**
   * Custom collision detection for nested sortable with folders
   */
  const customCollisionDetection = useCallback(
    (args) => {
      // Standard collision detection
      const pointerCollisions = pointerWithin(args);
      const rectCollisions = rectIntersection(args);

      const folderCollisions = pointerCollisions.filter(
        ({ data }) => data?.current?.isFolder,
      );

      if (folderCollisions.length > 0) {
        return folderCollisions;
      }

      const analysisCollisions = rectCollisions.filter(
        ({ id, data }) =>
          !id.toString().startsWith('root-') && !data?.current?.isFolder,
      );

      if (analysisCollisions.length > 0) {
        return analysisCollisions;
      }

      // Only consider root collisions in reorder mode
      if (reorderMode) {
        const rootCollisions = pointerCollisions.filter(({ id }) =>
          id.toString().startsWith('root-'),
        );

        if (rootCollisions.length > 0) {
          return rootCollisions;
        }
      }

      return closestCenter(args);
    },
    [reorderMode],
  );

  /**
   * Handle drag end event
   */
  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      setActiveId(null);

      // If no valid drop target, do nothing
      if (!over) {
        return;
      }

      // If dropped on itself, do nothing
      if (active.id === over.id) {
        return;
      }

      // Find the active item and its current parent
      const activeInfo = findItemWithParent(items, active.id);
      if (!activeInfo) {
        return;
      }

      const activeData = active.data.current;
      const overData = over.data.current;

      // SPECIAL LOGIC: If item is currently in a folder and is dropped outside that folder,
      // move it to root automatically
      if (activeInfo.parent && reorderMode) {
        // Find what folder the drop target is in
        const overInfo = findItemWithParent(items, over.id);

        // Determine the target folder
        let targetFolderId = null;
        if (overData?.isFolder) {
          targetFolderId = over.id;
        } else if (overInfo?.parent) {
          targetFolderId = overInfo.parent.id;
        }

        // If dropped on the same parent folder, user is trying to drop in "empty space"
        // within that folder's area - move to root instead
        if (over.id === activeInfo.parent.id) {
          targetFolderId = null; // Force move to root
        }

        // If target folder is different from current parent AND target is root,
        // move to root. If being dropped into a different folder, fall through to normal logic.
        if (
          targetFolderId !== activeInfo.parent.id &&
          targetFolderId === null
        ) {
          if (onPendingReorder) {
            onPendingReorder({
              itemId: active.id,
              targetParentId: null,
              targetIndex: items.length,
            });
          } else {
            try {
              await teamService.moveItem(teamId, active.id, null, items.length);
              notificationAPI.success('Moved to root level');
            } catch (error) {
              logger.error('Failed to move item:', error);
              notificationAPI.error(error.message || 'Failed to move item');
            }
          }
          return;
        }
      }

      // Check if dropping on root zone
      const isRootDrop =
        overData?.isRoot || over.id.toString().startsWith('root-');

      // Prevent dropping folder into itself or its descendants
      if (activeData.isFolder && overData?.isFolder && !isRootDrop) {
        if (active.id === over.id || isDescendant(items, active.id, over.id)) {
          notificationAPI.error(
            'Cannot move a folder into itself or its descendants',
          );
          return;
        }
      }

      let targetParentId = null;
      let targetIndex = 0;

      // If dropping on root zone, move to root at end
      if (isRootDrop) {
        targetParentId = null;
        targetIndex = items.length;
      } else {
        // Find the over item
        const overInfo = findItemWithParent(items, over.id);
        if (!overInfo) return;

        // If dropping on a folder, place inside it
        if (overData?.isFolder) {
          targetParentId = over.id;
          targetIndex = 0;
        } else {
          // Otherwise, place as sibling (same parent as over item)
          targetParentId = overInfo.parent?.id || null;
          targetIndex = overInfo.index;

          // If moving within same parent, adjust index
          if (activeInfo.parent?.id === targetParentId) {
            if (activeInfo.index < overInfo.index) {
              targetIndex -= 1;
            }
          }
        }
      }

      // If in reorder mode, collect changes instead of applying immediately
      if (reorderMode && onPendingReorder) {
        onPendingReorder({
          itemId: active.id,
          targetParentId,
          targetIndex,
        });
      } else {
        // Apply immediately when not in reorder mode
        try {
          await teamService.moveItem(
            teamId,
            active.id,
            targetParentId,
            targetIndex,
          );
          notificationAPI.success('Item moved successfully');
        } catch (error) {
          logger.error('Failed to move item:', error);
          notificationAPI.error(error.message || 'Failed to move item');
        }
      }
    },
    [teamId, items, isDescendant, reorderMode, onPendingReorder],
  );

  /**
   * Handle drag start event
   */
  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  /**
   * Handle drag cancel event
   */
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // Create a bound findItemWithParent that uses current items
  const findItem = useCallback(
    (itemId) => findItemWithParent(items, itemId),
    [items],
  );

  return {
    activeId,
    customCollisionDetection,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    findItemWithParent: findItem,
  };
}
