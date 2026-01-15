import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Box,
  Stack,
  Group,
  Text,
  ActionIcon,
  Badge,
  ColorSwatch,
  ScrollArea,
  NavLink,
  Tooltip,
} from '@mantine/core';
import {
  IconBrandAsana,
  IconGripVertical,
  IconLogout,
  IconUserPlus,
  IconUserEdit,
} from '@tabler/icons-react';
import { useVisibleTeams } from '@/features/teams/hooks/useVisibleTeams';
import { useConnection } from '@/contexts/sseContext/index';
import { teamService } from '@/features/teams/api/teamService';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePermissions } from '@/features/auth/hooks/usePermissions';
import logger from '@/utils/logger';
import { modalService } from '@/modals/modalService';
import { EmptyState, PrimaryButton } from '../global';

// Sortable Team Item
const SortableTeamItem = ({
  team,
  isSelected,
  onClick,
  analysisCount,
  canReorder = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: team.id,
    disabled: team.isSystem || !canReorder,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={(e) => {
        if (!canReorder) return;
        const handle = e.currentTarget.querySelector('.team-drag-handle');
        const badge = e.currentTarget.querySelector('.team-analysis-count');
        if (handle) handle.style.opacity = '1';
        if (badge && !team.isSystem) badge.style.marginRight = '28px';
      }}
      onMouseLeave={(e) => {
        if (!canReorder) return;
        const handle = e.currentTarget.querySelector('.team-drag-handle');
        const badge = e.currentTarget.querySelector('.team-analysis-count');
        if (handle) handle.style.opacity = '0';
        if (badge && !team.isSystem) badge.style.marginRight = '0';
      }}
    >
      <NavLink
        active={isSelected}
        onClick={onClick}
        label={
          <Text
            size="md"
            fw={500}
            style={{
              wordWrap: 'break-word',
              whiteSpace: 'normal',
              lineHeight: 1.3,
            }}
          >
            {team.name}
          </Text>
        }
        leftSection={
          <Group gap={6}>
            <ColorSwatch color={team.color} size={18} />
          </Group>
        }
        rightSection={
          <Box
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Badge
              className="team-analysis-count"
              size="md"
              variant={isSelected ? 'filled' : 'light'}
              color={isSelected ? 'brand' : 'gray'}
              style={{
                transition: 'margin-right 200ms ease',
                marginRight: 0,
              }}
            >
              {analysisCount}
            </Badge>
            {!team.isSystem && canReorder && (
              <Box
                {...attributes}
                {...listeners}
                className="team-drag-handle"
                style={{
                  position: 'absolute',
                  right: 0,
                  cursor: 'grab',
                  opacity: 0,
                  transition: 'opacity 200ms',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  borderRadius: '4px',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <IconGripVertical size={16} />
              </Box>
            )}
          </Box>
        }
        styles={{
          root: {
            borderRadius: 'var(--mantine-radius-md)',
            marginBottom: 4,
            minHeight: 44,
            cursor: team.isSystem ? 'pointer' : 'default', // Different cursor for system teams
            '&[dataActive]': {
              background:
                'linear-gradient(135deg, var(--mantine-color-brand-1) 0%, var(--mantine-color-accent-1) 100%)',
              color: 'var(--mantine-color-brand-8)',
              borderLeft: '3px solid var(--mantine-color-brand-6)',
              fontWeight: 500,
            },
            '&:hover': {
              '& .team-drag-handle': {
                opacity: 1,
              },
            },
          },
          label: {
            flex: 1,
            overflow: 'visible',
          },
          section: {
            alignItems: 'flex-start',
            paddingTop: 2,
          },
        }}
      />
    </div>
  );
};

SortableTeamItem.propTypes = {
  team: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
    isSystem: PropTypes.bool,
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  analysisCount: PropTypes.number.isRequired,
  canReorder: PropTypes.bool,
};

// Main Team Sidebar Component
export default function TeamSidebar({ selectedTeam, onTeamSelect }) {
  const { hasInitialData } = useConnection();
  const { user, logout, isImpersonating } = useAuth();
  const { isAdmin } = usePermissions();

  // Use custom hook for visible teams and analysis counts
  const { teamsArray, getTeamAnalysisCount } = useVisibleTeams();

  const [draggedAnalysis, setDraggedAnalysis] = useState(null);
  const [activeTeamId, setActiveTeamId] = useState(null);

  // Wrapper for analysis count (maintains API compatibility)
  const getAnalysisCount = (teamId) => {
    return getTeamAnalysisCount(teamId);
  };

  const handleTeamClick = (teamId) => {
    onTeamSelect?.(teamId);
  };

  const handleAnalysisDrop = async (e, teamId) => {
    e.preventDefault();
    if (!draggedAnalysis) return;

    try {
      await teamService.moveAnalysisToTeam(draggedAnalysis, teamId);
      logger.log(`Moved analysis ${draggedAnalysis} to team ${teamId}`);
    } catch (error) {
      logger.error('Error moving analysis:', error);
    }

    setDraggedAnalysis(null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = teamsArray.findIndex((t) => t.id === active.id);
      const newIndex = teamsArray.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(teamsArray, oldIndex, newIndex);

        try {
          await teamService.reorderTeams(newOrder.map((t) => t.id));
        } catch (error) {
          logger.error('Error reordering teams:', error);
        }
      }
    }
    setActiveTeamId(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Box
        p="md"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group justify="space-between">
          <Text fw={600} size="xl" c="brand.8">
            Teams
          </Text>
        </Group>

        <Group mt="md" gap="xs">
          <PrimaryButton
            variant={!selectedTeam ? 'gradient' : 'default'}
            size="xs"
            style={{ flex: 1 }}
            onClick={() => handleTeamClick(null)}
          >
            All Analyses
          </PrimaryButton>
          {isAdmin && (
            <Tooltip label="Manage teams">
              <ActionIcon
                variant="light"
                color="brand"
                size="lg"
                onClick={() => modalService.openTeamManagement()}
                aria-label="Manage teams"
              >
                <IconBrandAsana size={18} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          )}
          {isAdmin && (
            <Tooltip label="Manage users">
              <ActionIcon
                variant="light"
                color="accent"
                size="lg"
                onClick={() => modalService.openUserManagement()}
                aria-label="Manage users"
              >
                <IconUserPlus size={18} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Box>

      {/* Team List */}
      <ScrollArea style={{ flex: 1 }} p="md">
        <Stack gap="xs">
          {!hasInitialData ? (
            <Text c="dimmed" size="sm" ta="center" py="md">
              Loading teams...
            </Text>
          ) : teamsArray.length === 0 ? (
            <EmptyState title="No teams assigned" py="md" />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              onDragStart={(event) => setActiveTeamId(event.active.id)}
            >
              <SortableContext
                items={teamsArray.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {teamsArray.map((team) => (
                  <div
                    key={team.id}
                    onDrop={(e) => handleAnalysisDrop(e, team.id)}
                    onDragOver={(e) => e.preventDefault()}
                    style={{
                      borderRadius: 'var(--mantine-radius-md)',
                      outline: draggedAnalysis
                        ? '2px solid var(--mantine-color-brand-filled)'
                        : 'none',
                      outlineOffset: '2px',
                    }}
                  >
                    <SortableTeamItem
                      team={team}
                      isSelected={selectedTeam === team.id}
                      onClick={() => handleTeamClick(team.id)}
                      analysisCount={getAnalysisCount(team.id)}
                      canReorder={isAdmin}
                    />
                  </div>
                ))}
              </SortableContext>
              <DragOverlay>
                {activeTeamId ? (
                  <Box style={{ opacity: 0.8 }}>
                    <SortableTeamItem
                      team={teamsArray.find((t) => t.id === activeTeamId)}
                      isSelected={false}
                      onClick={() => {}}
                      analysisCount={getAnalysisCount(activeTeamId)}
                      canReorder={isAdmin}
                    />
                  </Box>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </Stack>
      </ScrollArea>

      {/* User Footer */}
      <Box
        p="md"
        style={{
          borderTop: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                Hi, {user.username || user.name}
              </Text>
              {user.role && (
                <Text size="xs" c="dimmed" truncate>
                  {user.role}
                </Text>
              )}
            </Box>
          </Group>
          <Group gap="xs">
            {/* Hide profile settings when impersonating - admins should not edit impersonated user's profile */}
            {!isImpersonating && (
              <Tooltip label="Profile Settings">
                <ActionIcon
                  variant="light"
                  color="brand"
                  size="sm"
                  onClick={() => modalService.openProfile()}
                  aria-label="Profile Settings"
                >
                  <IconUserEdit size={14} aria-hidden="true" />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="Logout">
              <ActionIcon
                variant="light"
                color="red"
                size="sm"
                onClick={logout}
                aria-label="Logout"
              >
                <IconLogout size={14} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>
    </Stack>
  );
}

TeamSidebar.propTypes = {
  selectedTeam: PropTypes.string,
  onTeamSelect: PropTypes.func,
};
