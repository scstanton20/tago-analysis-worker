/**
 * Utilities for tree structure reordering and manipulation
 * Used by analysis list and tree components for drag-and-drop operations
 * @module utils/reorderUtils
 */

/**
 * Find an item and its parent in a tree structure
 * @param {Array} items - Root level items
 * @param {string} itemId - ID of item to find
 * @param {Object|null} parent - Parent item (used for recursion)
 * @returns {Object|null} Object with { item, parent, index } or null if not found
 */
export function findItemWithParent(items, itemId, parent = null) {
  const search = (itemsList, currentParent) => {
    for (let i = 0; i < itemsList.length; i++) {
      const item = itemsList[i];
      if (item.id === itemId) {
        return { item, parent: currentParent, index: i };
      }
      if (item.type === 'folder' && item.items) {
        const found = search(item.items, item);
        if (found) return found;
      }
    }
    return null;
  };
  return search(items, parent);
}

/**
 * Apply a reorder operation to a team structure
 * @param {Object} structure - Current team structure
 * @param {Object} reorder - Reorder info { itemId, targetParentId, targetIndex }
 * @param {string} selectedTeam - Team ID being modified
 * @returns {Object} New structure with reorder applied
 */
export function applyReorderToStructure(structure, reorder, selectedTeam) {
  // Deep clone the structure to avoid mutations
  const newStructure = structuredClone(structure);
  const items = newStructure?.[selectedTeam]?.items || [];

  // Find the item to move
  const activeInfo = findItemWithParent(items, reorder.itemId);
  if (!activeInfo) return newStructure;

  // Remove item from its current location
  const removeFromParent = (items, itemId) => {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === itemId) {
        return items.splice(i, 1)[0];
      }
      if (items[i].type === 'folder' && items[i].items) {
        const removed = removeFromParent(items[i].items, itemId);
        if (removed) return removed;
      }
    }
    return null;
  };

  const itemToMove = removeFromParent(items, reorder.itemId);
  if (!itemToMove) return newStructure;

  // Insert item at new location
  if (reorder.targetParentId) {
    // Find target folder and insert
    const findAndInsert = (itemsList) => {
      for (const item of itemsList) {
        if (item.id === reorder.targetParentId && item.type === 'folder') {
          item.items = item.items || [];
          item.items.splice(reorder.targetIndex, 0, itemToMove);
          return true;
        }
        if (item.type === 'folder' && item.items) {
          if (findAndInsert(item.items)) return true;
        }
      }
      return false;
    };
    findAndInsert(items);
  } else {
    // Insert at root level
    items.splice(reorder.targetIndex, 0, itemToMove);
  }

  return newStructure;
}

/**
 * Add a pending folder to the local structure
 * @param {Object} structure - Current local structure
 * @param {Object} folderInfo - Folder info { name, parentFolderId }
 * @param {string} tempId - Temporary ID for the folder
 * @param {string} selectedTeam - Team ID being modified
 * @returns {Object} New structure with folder added
 */
export function addPendingFolderToStructure(
  structure,
  folderInfo,
  tempId,
  selectedTeam,
) {
  const newFolder = {
    id: tempId,
    type: 'folder',
    name: folderInfo.name,
    items: [],
  };

  // Deep clone the structure to avoid mutations
  const newStructure = structuredClone(structure);
  const teamItems = newStructure[selectedTeam]?.items || [];

  if (folderInfo.parentFolderId) {
    // Add to parent folder
    const findAndAdd = (items) => {
      for (const item of items) {
        if (item.id === folderInfo.parentFolderId) {
          item.items = item.items || [];
          item.items.push(newFolder);
          return true;
        }
        if (item.type === 'folder' && item.items) {
          if (findAndAdd(item.items)) return true;
        }
      }
      return false;
    };
    findAndAdd(teamItems);
  } else {
    // Add to root
    teamItems.push(newFolder);
  }

  return newStructure;
}
