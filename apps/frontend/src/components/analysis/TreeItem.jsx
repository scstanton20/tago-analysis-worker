/**
 * Tree Item Component
 * Renders a single item (folder or analysis) in the analysis tree
 * Supports drag-and-drop reordering, nesting, and expansion
 *
 */

import { useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Stack,
  Group,
  ActionIcon,
  Text,
  Collapse,
  Box,
  Badge,
} from '@mantine/core';
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFolderOpen,
  IconEdit,
  IconTrash,
  IconFolderPlus,
} from '@tabler/icons-react';
import { ActionMenu } from '../global/menus/ActionMenu';
import { DragHandle } from '../global/indicators/DragHandle';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AnalysisItem from './analysisItem';

/**
 * TreeItem Component
 * Renders either a folder with children or an analysis item
 */
export default function TreeItem({
  item,
  depth = 0,
  onToggle,
  expandedFolders,
  allAnalyses,
  onFolderAction,
  reorderMode = false,
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
            cursor: 'pointer',
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
          {/* Drag handle - only visible in reorder mode */}
          {reorderMode && (
            <DragHandle {...attributes} {...listeners} opacity={0.6} />
          )}

          <Box
            style={{
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
            style={{
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
            style={{
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

          <ActionMenu
            items={[
              {
                label: 'Add Subfolder',
                icon: <IconFolderPlus size={16} />,
                onClick: () => onFolderAction('createSubfolder', item),
              },
              // Rename is disabled in reorder mode
              ...(reorderMode
                ? []
                : [
                    {
                      label: 'Rename',
                      icon: <IconEdit size={16} />,
                      onClick: () => onFolderAction('rename', item),
                    },
                  ]),
              { type: 'divider' },
              {
                label: 'Delete Folder',
                icon: <IconTrash size={16} />,
                onClick: () => onFolderAction('delete', item),
                color: 'red',
              },
            ]}
            triggerSize="sm"
          />
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
                      reorderMode={reorderMode}
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

  // Analysis item - look up by analysis ID (item.id contains the analysis UUID in v5.0)
  const analysis = allAnalyses[item.id];
  if (!analysis) {
    return (
      <div ref={setNodeRef} style={style}>
        <Text size="sm" c="dimmed">
          Analysis "{item.id}" not found
        </Text>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Group
        gap="xs"
        wrap="nowrap"
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          transition: 'background-color 0.2s',
          padding: '4px',
        }}
      >
        {/* Drag handle - only visible in reorder mode */}
        {reorderMode && (
          <DragHandle
            {...attributes}
            {...listeners}
            opacity={0.6}
            style={{
              alignSelf: 'flex-start',
              marginTop: '12px',
            }}
          />
        )}

        <Box style={{ flex: 1, minWidth: 0 }}>
          <AnalysisItem analysis={analysis} reorderMode={reorderMode} />
        </Box>
      </Group>
    </div>
  );
}

TreeItem.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['folder', 'analysis']).isRequired,
    name: PropTypes.string, // Only for folders
    expanded: PropTypes.bool,
    items: PropTypes.array, // Only for folders
  }).isRequired,
  depth: PropTypes.number,
  onToggle: PropTypes.func.isRequired,
  expandedFolders: PropTypes.object.isRequired,
  allAnalyses: PropTypes.object.isRequired,
  onFolderAction: PropTypes.func.isRequired,
  reorderMode: PropTypes.bool,
};
