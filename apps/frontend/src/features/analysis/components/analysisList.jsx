import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Stack,
  Group,
  Text,
  Center,
  Loader,
  Box,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconFileText,
  IconUserX,
  IconFolderPlus,
  IconArrowsSort,
  IconCheck,
  IconX,
  IconPlus,
} from '@tabler/icons-react';
import { useAnalyses, useTeams, useConnection } from '@/contexts/sseContext';
import { usePermissions } from '@/features/auth/hooks/usePermissions';
import { useVisibleTeams } from '@/features/teams/hooks/useVisibleTeams';
import logger from '@/utils/logger';
import {
  applyReorderToStructure,
  addPendingFolderToStructure,
} from '@/utils/reorderUtils';
import { modalService } from '@/modals/modalService';
import { ActionMenu } from '@/components/global/menus/ActionMenu';
import { ConfirmDialog } from '@/components/global';
import {
  FormAlert,
  EmptyState,
  PaperCard,
  SecondaryButton,
  CancelButton,
  SuccessButton,
  ContentBox,
} from '@/components/global';
import { teamService } from '@/features/teams/api/teamService';
import { notificationAPI } from '@/utils/notificationAPI.jsx';
import AnalysisTree from './analysisTree';
import AnalysisItem from './analysisItem';

export default function AnalysisList({
  analyses = null,
  showTeamLabels = false,
  selectedTeam = null,
}) {
  // useVisibleTeams provides teams, counts, and internally uses useAnalyses
  const { teamsArray, teamsObject, getTeamAnalysisCount } = useVisibleTeams();
  const { analyses: allAnalyses } = useAnalyses();
  const { teamStructure, teamStructureVersion } = useTeams();
  const { connectionStatus } = useConnection();
  const { isAdmin, canUploadAnalyses } = usePermissions();

  const [reorderMode, setReorderMode] = useState(false);
  const [pendingReorders, setPendingReorders] = useState([]);
  const [localStructure, setLocalStructure] = useState(null);
  const [pendingFolders, setPendingFolders] = useState([]);
  const [pendingFolderDeletions, setPendingFolderDeletions] = useState([]);

  // Handler for creating pending folders in reorder mode
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

  // Use the pre-filtered analyses passed from parent (AuthenticatedApp)
  const analysesToShow = useMemo(() => analyses || {}, [analyses]);

  // Create a map of team ID to sidebar order index for sorting
  const teamOrderMap = useMemo(() => {
    const map = new Map();
    teamsArray.forEach((team, index) => {
      map.set(team.id, index);
    });
    return map;
  }, [teamsArray]);

  // Convert to array for rendering, sorted by sidebar team order
  const analysesArray = useMemo(() => {
    const array = Object.values(analysesToShow).filter(
      (analysis) => analysis && analysis.id,
    );
    // Sort by team order (same order as sidebar), then by name within each team
    array.sort((a, b) => {
      const teamA = a.teamId || 'uncategorized';
      const teamB = b.teamId || 'uncategorized';
      const orderA = teamOrderMap.get(teamA) ?? Number.MAX_SAFE_INTEGER;
      const orderB = teamOrderMap.get(teamB) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });
    return array;
  }, [analysesToShow, teamOrderMap]);

  // Calculate total accessible analyses using consolidated hook
  const totalAccessibleAnalyses = useMemo(() => {
    if (isAdmin) {
      return Object.keys(allAnalyses || {}).length;
    }
    // Sum counts across all visible teams
    return teamsArray.reduce(
      (sum, team) => sum + getTeamAnalysisCount(team.id),
      0,
    );
  }, [allAnalyses, isAdmin, teamsArray, getTeamAnalysisCount]);

  // Helper function to get team info - uses consolidated teamsObject
  const getTeamInfo = useCallback(
    (teamId) => {
      if (!teamId || teamId === 'uncategorized') {
        return { name: 'Uncategorized', color: '#9ca3af' };
      }
      const team = teamsObject[teamId];
      if (team) return team;
      logger.warn(`Team ${teamId} not found`);
      return { name: 'Unknown Team', color: '#ef4444' };
    },
    [teamsObject],
  );

  // Folder handlers
  const handleCreateFolder = useCallback(
    (parentFolder = null) => {
      modalService.openCreateFolder(selectedTeam, {
        parentFolderId: parentFolder?.id,
        parentFolderName: parentFolder?.name,
        onCreatePending: reorderMode ? handleCreatePendingFolder : null,
      });
    },
    [selectedTeam, reorderMode, handleCreatePendingFolder],
  );

  const handleFolderAction = useCallback(
    async (action, folder) => {
      switch (action) {
        case 'createSubfolder':
          handleCreateFolder(folder);
          break;

        case 'rename':
          modalService.openRenameFolder(selectedTeam, folder.id, folder.name);
          break;

        case 'delete':
          ConfirmDialog.delete({
            title: 'Delete Folder',
            message: `Are you sure you want to delete "${folder.name}"? All items inside will be moved to the parent folder.`,
            onConfirm: async () => {
              if (reorderMode) {
                const isTempFolder = folder.id.startsWith('temp-');

                if (!isTempFolder) {
                  setPendingFolderDeletions((prev) => [...prev, folder.id]);
                } else {
                  setPendingFolders((prev) =>
                    prev.filter((f) => f.tempId !== folder.id),
                  );
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
                  isTempFolder
                    ? 'Folder Removed'
                    : 'Folder Marked for Deletion',
                );
              } else {
                try {
                  await teamService.deleteFolder(selectedTeam, folder.id);
                  notificationAPI.success(`Folder "${folder.name}" deleted`);
                } catch (error) {
                  notificationAPI.error(
                    error.message || 'Failed to delete folder',
                  );
                }
              }
            },
          });
          break;

        default:
          logger.warn('Unknown folder action:', action);
      }
    },
    [selectedTeam, handleCreateFolder, reorderMode],
  );

  // Reorder handlers
  const handlePendingReorder = useCallback(
    (reorderInfo) => {
      setPendingReorders((prev) => [...prev, reorderInfo]);
      setLocalStructure((prev) =>
        applyReorderToStructure(prev, reorderInfo, selectedTeam),
      );
    },
    [selectedTeam],
  );

  const handleCancelReorder = useCallback(() => {
    setPendingReorders([]);
    setPendingFolders([]);
    setPendingFolderDeletions([]);
    setReorderMode(false);
    setLocalStructure(null);
  }, []);

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

  // Simplified: no team access if non-admin with no visible teams
  const hasNoTeamAccess = !isAdmin && teamsArray.length === 0;
  const hasAnalyses = analysesArray.length > 0;
  const currentTeamInfo = selectedTeam ? teamsObject[selectedTeam] : null;

  // Handle loading state
  if (connectionStatus === 'connecting') {
    return (
      <PaperCard title="Available Analyses" p="lg" radius="md">
        <Center py="xl">
          <Group>
            <Loader size="sm" color="brand" />
            <Text c="dimmed">Connecting to server...</Text>
          </Group>
        </Center>
      </PaperCard>
    );
  }

  // Handle disconnected state
  if (connectionStatus === 'disconnected') {
    return (
      <PaperCard title="Available Analyses" p="lg" radius="md">
        <FormAlert
          type="error"
          message="Disconnected from server. Attempting to reconnect..."
        />
      </PaperCard>
    );
  }

  return (
    <ContentBox p="lg" radius="md">
      <Stack>
        {/* Header */}
        <Group justify="space-between" mb="md">
          <Box>
            <Text size="lg" fw={600}>
              {selectedTeam ? 'Team Analyses' : 'All Analyses'}
            </Text>

            {/* Team info */}
            {selectedTeam && currentTeamInfo && (
              <Group gap="xs" mt={4}>
                <Box
                  w={12}
                  h={12}
                  style={{
                    borderRadius: '50%',
                    backgroundColor: currentTeamInfo.color,
                  }}
                />
                <Text size="sm" c="dimmed" fw={500}>
                  {currentTeamInfo.name}
                </Text>
              </Group>
            )}

            {/* Count info */}
            <Text size="sm" c="dimmed" mt={4}>
              {hasAnalyses
                ? `${analysesArray.length} ${analysesArray.length === 1 ? 'analysis' : 'analyses'}${selectedTeam ? '' : ' available'}`
                : selectedTeam
                  ? 'No analyses in this team'
                  : 'No analyses available'}
            </Text>
          </Box>

          {/* Action buttons */}
          <Group gap="xs">
            {/* Create Analysis Button - always visible when user has upload permissions */}
            {canUploadAnalyses() && (
              <Tooltip label="Create Analysis" position="bottom">
                <ActionIcon
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                  size="lg"
                  radius="md"
                  onClick={() =>
                    modalService.openAnalysisCreator({
                      targetTeam: selectedTeam,
                    })
                  }
                  aria-label="Create Analysis"
                >
                  <IconPlus size={20} />
                </ActionIcon>
              </Tooltip>
            )}

            {/* Reorganize buttons - only when viewing a team with analyses */}
            {hasAnalyses &&
              selectedTeam &&
              (reorderMode ? (
                <>
                  <SecondaryButton
                    onClick={() => handleCreateFolder(null)}
                    size="sm"
                    leftSection={<IconFolderPlus size={16} />}
                  >
                    Create Folder
                  </SecondaryButton>
                  <CancelButton
                    onClick={handleCancelReorder}
                    size="sm"
                    leftSection={<IconX size={16} />}
                  >
                    Cancel
                  </CancelButton>
                  <SuccessButton
                    onClick={handleApplyReorders}
                    size="sm"
                    leftSection={<IconCheck size={16} />}
                  >
                    Done
                  </SuccessButton>
                </>
              ) : (
                <ActionMenu
                  items={[
                    {
                      label: 'Reorganize List',
                      icon: <IconArrowsSort size={16} />,
                      onClick: () => {
                        setLocalStructure(structuredClone(teamStructure));
                        setReorderMode(true);
                      },
                    },
                  ]}
                  triggerVariant="light"
                  triggerSize="lg"
                />
              ))}
          </Group>
        </Group>

        {/* Content */}
        <Stack gap="md">
          {hasNoTeamAccess ? (
            <Center py="xl">
              <Stack align="center" gap="md">
                <FormAlert
                  type="warning"
                  icon={<IconUserX size={20} />}
                  title="No Team Access"
                  message="You haven't been assigned to any teams yet. Please contact an administrator to request access to the teams you need."
                  style={{ maxWidth: 500 }}
                />
              </Stack>
            </Center>
          ) : selectedTeam ? (
            <AnalysisTree
              key={`tree-${selectedTeam}-${reorderMode ? 'reorder' : teamStructureVersion}`}
              teamId={selectedTeam}
              teamStructure={
                reorderMode && localStructure ? localStructure : teamStructure
              }
              analyses={allAnalyses}
              onFolderAction={handleFolderAction}
              reorderMode={reorderMode}
              onPendingReorder={handlePendingReorder}
            />
          ) : hasAnalyses ? (
            analysesArray.map((analysis) => {
              const teamInfo = getTeamInfo(analysis.teamId);

              return (
                <Stack key={`analysis-${analysis.id}`} gap="xs">
                  {/* Team Label (when showing all analyses) */}
                  {showTeamLabels && (
                    <Group gap="xs">
                      <Box
                        w={12}
                        h={12}
                        style={{
                          borderRadius: '50%',
                          backgroundColor: teamInfo.color,
                        }}
                      />
                      <Text size="sm" c="dimmed" fw={500}>
                        {teamInfo.name}
                      </Text>
                    </Group>
                  )}

                  {/* Analysis Item */}
                  <AnalysisItem
                    analysis={analysis}
                    teamInfo={showTeamLabels ? teamInfo : null}
                  />
                </Stack>
              );
            })
          ) : (
            <EmptyState
              icon={<IconFileText size={48} />}
              title={
                selectedTeam
                  ? 'No analyses found in this team'
                  : totalAccessibleAnalyses === 0
                    ? 'No analyses available'
                    : 'Loading analyses...'
              }
              description={
                selectedTeam
                  ? 'Try selecting a different team or create a new analysis here.'
                  : totalAccessibleAnalyses === 0
                    ? 'Upload an analysis file to get started.'
                    : 'Please wait while analyses load from the server.'
              }
            >
              {selectedTeam && currentTeamInfo && (
                <FormAlert
                  type="info"
                  message={
                    <>
                      You can create a new analysis for the{' '}
                      <strong>{currentTeamInfo.name}</strong> team using the
                      analysis creator above.
                    </>
                  }
                />
              )}
            </EmptyState>
          )}
        </Stack>
      </Stack>
    </ContentBox>
  );
}

AnalysisList.propTypes = {
  analyses: PropTypes.object,
  showTeamLabels: PropTypes.bool,
  selectedTeam: PropTypes.string,
};
