/**
 * Analysis Tree Component
 * Hierarchical tree view for managing analyses and folders with drag-and-drop
 * @module components/analysis/analysisTree
 */

import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Stack, Group, Text, Box } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useTreeDragDrop } from '@/features/teams/hooks/useTreeDragDrop';
import TreeItem from './TreeItem';
import AnalysisItem from './analysisItem';

/**
 * Main Analysis Tree Component
 * Renders a hierarchical tree structure with drag-and-drop support
 */
export default function AnalysisTree({
  teamId,
  teamStructure,
  analyses,
  onFolderAction,
  reorderMode = false,
  onPendingReorder = null,
}) {
  const [expandedFolders, setExpandedFolders] = useState({});

  // Make the entire tree area a droppable zone for moving items to root
  const rootDropId = `root-${teamId}`;

  const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({
    id: rootDropId,
    data: {
      type: 'root',
      isRoot: true,
    },
  });

  // Safety check - teamStructure might be undefined during initial load
  const items = teamStructure?.[teamId]?.items || [];

  // Use drag-and-drop hook
  const {
    activeId,
    customCollisionDetection,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    findItemWithParent,
  } = useTreeDragDrop({
    teamId,
    items,
    reorderMode,
    onPendingReorder,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleToggle = useCallback((folderId, newState) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: newState,
    }));
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
                  reorderMode={reorderMode}
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
                  <AnalysisItem analysis={analyses[activeItem.id]} />
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
  reorderMode: PropTypes.bool,
  onPendingReorder: PropTypes.func,
};

AnalysisTree.defaultProps = {
  teamStructure: {},
};
