// frontend/src/components/analysis/analysisTree.jsx
import { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import logger from '../../utils/logger';
import {
  Stack,
  Group,
  ActionIcon,
  Text,
  Collapse,
  Box,
  Menu,
  Badge,
} from '@mantine/core';
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFolderOpen,
  IconDotsVertical,
  IconEdit,
  IconTrash,
  IconFolderPlus,
} from '@tabler/icons-react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AnalysisItem from './analysisItem';
import teamService from '../../services/teamService';
import { notifications } from '@mantine/notifications';

function TreeItem({
  item,
  depth = 0,
  onToggle,
  expandedFolders,
  allAnalyses,
  onFolderAction,
  expandedAnalyses,
  onToggleAnalysisLogs,
  reorderMode = false,
  reorderModeKey = 0,
}) {
  const isFolder = item.type === 'folder';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: item.id,
    data: {
      type: item.type,
      item: item,
      isFolder: isFolder,
    },
    disabled: !reorderMode,
  });

  // Disable transform when folder is being used as drop target
  const shouldDisableTransform = isFolder && isOver && !isDragging;

  const style = {
    transform: shouldDisableTransform
      ? undefined
      : CSS.Transform.toString(transform),
    transition: shouldDisableTransform ? undefined : transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Auto-expand folder when something is dragged over it in reorder mode
  useEffect(() => {
    if (isFolder && reorderMode && isOver && !expandedFolders[item.id]) {
      // Set timeout to expand after 800ms of hovering
      const timeout = setTimeout(() => {
        onToggle(item.id, true);
      }, 800);

      // Cleanup timeout when no longer hovering or component unmounts
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [isOver, isFolder, reorderMode, expandedFolders, item.id, onToggle]);

  if (isFolder) {
    const isExpanded = expandedFolders[item.id] ?? false;

    // Count analyses in this folder (recursively)
    const countAnalyses = (items) => {
      if (!items || items.length === 0) return 0;
      return items.reduce((count, child) => {
        if (child.type === 'analysis') return count + 1;
        if (child.type === 'folder' && child.items) {
          return count + countAnalyses(child.items);
        }
        return count;
      }, 0);
    };
    const analysisCount = countAnalyses(item.items);

    return (
      <div ref={setNodeRef} style={style}>
        <Group
          gap="xs"
          mb="xs"
          wrap="nowrap"
          className={reorderMode ? 'tree-item-reorder' : ''}
          data-reorder-key={reorderModeKey}
          onClick={(e) => {
            // Don't toggle if clicking on menu or other interactive elements
            if (
              e.target.closest('[role="button"]') ||
              e.target.closest('button')
            ) {
              return;
            }
            onToggle(item.id, !isExpanded);
          }}
          style={{
            backgroundColor: isOver
              ? 'light-dark(var(--mantine-color-brand-1), var(--mantine-color-brand-9))'
              : 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
            borderLeft: isOver
              ? '3px solid var(--mantine-color-brand-6)'
              : '3px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
            borderRadius: 'var(--mantine-radius-md)',
            transition: 'all 0.3s ease',
            padding: '12px',
            cursor: reorderMode ? 'default' : 'pointer',
            border: isOver
              ? '1px solid var(--mantine-color-brand-6)'
              : reorderMode
                ? '1px dashed light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-4))'
                : '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))',
            boxShadow: isOver
              ? '0 0 0 3px light-dark(var(--mantine-color-brand-1), var(--mantine-color-brand-9))'
              : undefined,
          }}
        >
          <Box
            {...(reorderMode ? { ...attributes, ...listeners } : {})}
            style={{
              cursor: reorderMode ? 'grab' : 'inherit',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ActionIcon
              size="sm"
              variant="subtle"
              color="brand"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(item.id, !isExpanded);
              }}
            >
              {isExpanded ? (
                <IconChevronDown size={16} />
              ) : (
                <IconChevronRight size={16} />
              )}
            </ActionIcon>
          </Box>

          <Box
            {...(reorderMode ? { ...attributes, ...listeners } : {})}
            style={{
              cursor: reorderMode ? 'grab' : 'inherit',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {isExpanded ? (
              <IconFolderOpen
                size={18}
                style={{
                  color: 'white',
                }}
              />
            ) : (
              <IconFolder
                size={18}
                style={{
                  color: 'white',
                }}
              />
            )}
          </Box>

          <Box
            {...(reorderMode ? { ...attributes, ...listeners } : {})}
            style={{
              cursor: reorderMode ? 'grab' : 'inherit',
              flex: 1,
              minWidth: 0,
            }}
          >
            <Group gap="xs">
              <Box
                px="sm"
                py="xs"
                style={{
                  backgroundColor: 'var(--mantine-color-brand-9)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '1px solid var(--mantine-color-brand-7)',
                  display: 'inline-block',
                }}
              >
                <Text fw={600} size="md" c="white">
                  {item.name}
                </Text>
              </Box>
              {analysisCount > 0 && (
                <Badge variant="light" color="brand" size="sm">
                  {analysisCount}{' '}
                  {analysisCount === 1 ? 'analysis' : 'analyses'}
                </Badge>
              )}
            </Group>
          </Box>

          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon size="sm" variant="subtle" color="brand">
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconFolderPlus size={16} />}
                onClick={() => onFolderAction('createSubfolder', item)}
              >
                Add Subfolder
              </Menu.Item>
              <Menu.Item
                leftSection={<IconEdit size={16} />}
                onClick={() => onFolderAction('rename', item)}
              >
                Rename
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconTrash size={16} />}
                onClick={() => onFolderAction('delete', item)}
                color="red"
              >
                Delete Folder
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        <Collapse in={isExpanded}>
          <Box
            pl="md"
            pt="xs"
            pb="xs"
            mt="xs"
            style={{
              backgroundColor:
                'light-dark(rgba(var(--mantine-color-brand-1-rgb), 0.15), rgba(var(--mantine-color-brand-9-rgb), 0.15))',
              borderLeft:
                '2px solid light-dark(var(--mantine-color-brand-3), var(--mantine-color-brand-7))',
              borderRadius: 'var(--mantine-radius-sm)',
              transition: 'all 0.2s ease',
            }}
          >
            {item.items && item.items.length > 0 ? (
              <SortableContext
                items={item.items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <Stack gap="xs">
                  {item.items.map((child) => (
                    <TreeItem
                      key={child.id}
                      item={child}
                      depth={depth + 1}
                      onToggle={onToggle}
                      expandedFolders={expandedFolders}
                      allAnalyses={allAnalyses}
                      onFolderAction={onFolderAction}
                      expandedAnalyses={expandedAnalyses}
                      onToggleAnalysisLogs={onToggleAnalysisLogs}
                      reorderMode={reorderMode}
                      reorderModeKey={reorderModeKey}
                    />
                  ))}
                </Stack>
              </SortableContext>
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xs">
                Empty folder
              </Text>
            )}
          </Box>
        </Collapse>
      </div>
    );
  }

  // Analysis item
  const analysis = allAnalyses[item.analysisName];
  if (!analysis) {
    return (
      <div ref={setNodeRef} style={style}>
        <Text size="sm" c="dimmed">
          Analysis "{item.analysisName}" not found
        </Text>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(reorderMode ? { ...attributes, ...listeners } : {})}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        className={reorderMode ? 'tree-item-reorder' : ''}
        data-reorder-key={reorderModeKey}
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          transition: 'background-color 0.2s',
          padding: '4px',
          cursor: reorderMode ? 'grab' : 'default',
        }}
      >
        <Box style={{ flex: 1, minWidth: 0 }}>
          <AnalysisItem
            analysis={{ ...analysis, name: item.analysisName }}
            showLogs={expandedAnalyses[item.analysisName] || false}
            onToggleLogs={() => onToggleAnalysisLogs(item.analysisName)}
          />
        </Box>
      </Group>
    </div>
  );
}

TreeItem.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['folder', 'analysis']).isRequired,
    name: PropTypes.string,
    analysisName: PropTypes.string,
    expanded: PropTypes.bool,
    items: PropTypes.array,
  }).isRequired,
  depth: PropTypes.number,
  onToggle: PropTypes.func.isRequired,
  expandedFolders: PropTypes.object.isRequired,
  allAnalyses: PropTypes.object.isRequired,
  onFolderAction: PropTypes.func.isRequired,
  expandedAnalyses: PropTypes.object.isRequired,
  onToggleAnalysisLogs: PropTypes.func.isRequired,
  reorderMode: PropTypes.bool,
  reorderModeKey: PropTypes.number,
};

export default function AnalysisTree({
  teamId,
  teamStructure,
  analyses,
  onFolderAction,
  expandedAnalyses = {},
  onToggleAnalysisLogs,
  reorderMode = false,
  onPendingReorder = null,
  reorderModeKey = 0,
}) {
  const [expandedFolders, setExpandedFolders] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [animationCounter, setAnimationCounter] = useState(0);

  // Make the entire tree area a droppable zone for moving items to root
  const rootDropId = useMemo(() => `root-${teamId}`, [teamId]);

  const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({
    id: rootDropId,
    data: {
      type: 'root',
      isRoot: true,
    },
  });

  // Safety check - teamStructure might be undefined during initial load
  const items = useMemo(
    () => teamStructure?.[teamId]?.items || [],
    [teamStructure, teamId],
  );

  // Add shake animation for reorder mode - use stable key based on reorder mode state
  const animationKey = reorderMode
    ? `active-${reorderModeKey}-${animationCounter}`
    : 'inactive';
  const treeItemStyles = useMemo(
    () => `
    @keyframes shake-${animationKey} {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-1deg); }
      50% { transform: rotate(0deg); }
      75% { transform: rotate(1deg); }
    }

    .tree-item-reorder[data-reorder-key="${reorderModeKey}"] {
      animation: ${activeId ? 'none' : `shake-${animationKey} 1.5s linear infinite`};
      animation-fill-mode: both;
    }
  `,

    [animationKey, reorderModeKey, activeId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Custom collision detection for nested sortable with folders
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

  const handleToggle = useCallback(
    (folderId, newState) => {
      setExpandedFolders((prev) => ({
        ...prev,
        [folderId]: newState,
      }));
      // Increment animation counter to restart animations on newly visible items
      if (reorderMode) {
        setAnimationCounter((prev) => prev + 1);
      }
    },
    [reorderMode],
  );

  // Helper function to find item and its parent in tree
  const findItemWithParent = useCallback((items, itemId, parent = null) => {
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
  }, []);

  // Helper to check if target is a descendant of source
  const isDescendant = useCallback(
    (items, ancestorId, targetId) => {
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
    },
    [findItemWithParent],
  );

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
              notifications.show({
                title: 'Success',
                message: 'Moved to root level',
                color: 'green',
              });
            } catch (error) {
              logger.error('Failed to move item:', error);
              notifications.show({
                title: 'Error',
                message: error.message || 'Failed to move item',
                color: 'red',
              });
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
          notifications.show({
            title: 'Invalid Move',
            message: 'Cannot move a folder into itself or its descendants',
            color: 'red',
          });
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
          notifications.show({
            title: 'Success',
            message: 'Item moved successfully',
            color: 'green',
          });
        } catch (error) {
          logger.error('Failed to move item:', error);
          notifications.show({
            title: 'Error',
            message: error.message || 'Failed to move item',
            color: 'red',
          });
        }
      }
    },
    [
      teamId,
      items,
      findItemWithParent,
      isDescendant,
      reorderMode,
      onPendingReorder,
    ],
  );

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // Find active item for drag overlay
  const activeItem = activeId
    ? findItemWithParent(items, activeId)?.item
    : null;

  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        No analyses or folders in this team yet.
      </Text>
    );
  }

  return (
    <>
      <style>{treeItemStyles}</style>
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <Box
          ref={setRootDropRef}
          style={{
            minHeight: items.length === 0 ? '200px' : '100%',
            padding: reorderMode ? 'var(--mantine-spacing-sm)' : 0,
            borderRadius: 'var(--mantine-radius-sm)',
            transition: 'background-color 0.2s, border 0.2s',
            backgroundColor:
              reorderMode && isOverRoot
                ? 'light-dark(var(--mantine-color-brand-0), var(--mantine-color-brand-9))'
                : reorderMode
                  ? 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))'
                  : undefined,
            border:
              reorderMode && isOverRoot
                ? '2px dashed var(--mantine-color-brand-6)'
                : reorderMode
                  ? '2px dashed light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-4))'
                  : 'none',
            position: 'relative',
          }}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <Stack gap="md">
              {items.map((item) => (
                <TreeItem
                  key={item.id}
                  item={item}
                  depth={0}
                  onToggle={handleToggle}
                  expandedFolders={expandedFolders}
                  allAnalyses={analyses}
                  onFolderAction={onFolderAction}
                  expandedAnalyses={expandedAnalyses}
                  onToggleAnalysisLogs={onToggleAnalysisLogs}
                  reorderMode={reorderMode}
                  reorderModeKey={reorderModeKey}
                />
              ))}
            </Stack>
          </SortableContext>
        </Box>

        {/* Helper text when there's only one folder */}
        {reorderMode &&
          activeId &&
          items.length === 1 &&
          items[0].type === 'folder' && (
            <Box
              style={{
                padding: 'var(--mantine-spacing-xl)',
                textAlign: 'center',
                marginTop: 'var(--mantine-spacing-md)',
              }}
            >
              <Text size="sm" c="dimmed" fs="italic">
                Since this is the only folder in this team, drag the item onto
                the parent folder to remove from group.
              </Text>
            </Box>
          )}

        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <Box
              style={{
                cursor: 'grabbing',
                backgroundColor: 'var(--mantine-color-body)',
                border: '2px solid var(--mantine-color-brand-filled)',
                borderRadius: 'var(--mantine-radius-sm)',
                padding: 'var(--mantine-spacing-sm)',
                boxShadow: 'var(--mantine-shadow-xl)',
                minWidth: '200px',
                opacity: 0.95,
              }}
            >
              {activeItem.type === 'folder' ? (
                <Group gap="xs">
                  <IconFolder size={18} />
                  <Text fw={500}>{activeItem.name}</Text>
                </Group>
              ) : (
                <Box style={{ pointerEvents: 'none' }}>
                  <AnalysisItem
                    analysis={{
                      ...analyses[activeItem.analysisName],
                      name: activeItem.analysisName,
                    }}
                    showLogs={false}
                    onToggleLogs={() => {}}
                  />
                </Box>
              )}
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

AnalysisTree.propTypes = {
  teamId: PropTypes.string.isRequired,
  teamStructure: PropTypes.object,
  analyses: PropTypes.object.isRequired,
  onFolderAction: PropTypes.func.isRequired,
  expandedAnalyses: PropTypes.object,
  onToggleAnalysisLogs: PropTypes.func.isRequired,
  reorderMode: PropTypes.bool,
  onPendingReorder: PropTypes.func,
  reorderModeKey: PropTypes.number,
};

AnalysisTree.defaultProps = {
  teamStructure: {},
  expandedAnalyses: {},
};
