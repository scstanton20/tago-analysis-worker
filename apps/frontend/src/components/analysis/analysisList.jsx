import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  useAnalyses,
  useTeams,
  useConnection,
} from '../../contexts/sseContext';
import { usePermissions } from '../../hooks/usePermissions';
import logger from '../../utils/logger';
import {
  applyReorderToStructure,
  addPendingFolderToStructure,
} from '../../utils/reorderUtils';
import AnalysisItem from './analysisItem';
import AnalysisTree from './analysisTree';
import { modalService } from '../../modals/modalService';
import {
  Paper,
  Stack,
  Group,
  Text,
  Button,
  Center,
  Loader,
  Box,
  Alert,
  Menu,
  ActionIcon,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconFileText,
  IconInfoCircle,
  IconUserX,
  IconFolderPlus,
  IconDotsVertical,
  IconArrowsSort,
  IconCheck,
  IconX,
} from '@tabler/icons-react';
import teamService from '../../services/teamService';
import {
  showSuccess,
  showError,
  showInfo,
} from '../../utils/notificationService.jsx';

export default function AnalysisList({
  analyses = null,
  showTeamLabels = false,
  selectedTeam = null,
}) {
  const { analyses: allAnalyses = {} } = useAnalyses();
  const { teamStructure, teamStructureVersion, getTeam } = useTeams();
  const { connectionStatus } = useConnection();

  const { getViewableTeams, isAdmin } = usePermissions();

  const [openLogIds, setOpenLogIds] = useState(new Set());
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

  // Determine which analyses to show (memoized for performance)
  const analysesToShow = useMemo(() => {
    // If pre-filtered analyses are provided
    if (analyses !== null) {
      if (typeof analyses === 'object') {
        return analyses;
      }
    }

    // Use SSE and apply team filtering
    if (selectedTeam) {
      const filtered = {};
      Object.entries(allAnalyses).forEach(([name, analysis]) => {
        if (analysis.teamId === selectedTeam) {
          filtered[name] = analysis;
        }
      });
      return filtered;
    }

    return allAnalyses;
  }, [analyses, allAnalyses, selectedTeam]);

  // Convert to array for rendering (memoized)
  const analysesArray = useMemo(() => {
    const array = Object.values(analysesToShow).filter(
      (analysis) => analysis && analysis.name, // Ensure valid analysis objects
    );
    return array;
  }, [analysesToShow]);

  // Calculate total accessible analyses (not all analyses in system)
  const totalAccessibleAnalyses = useMemo(() => {
    if (isAdmin) {
      // Admin can see all analyses
      return Object.keys(allAnalyses).length;
    }

    // Non-admin: count only analyses in viewable teams
    const viewableTeams = getViewableTeams();
    const viewableTeamIds = viewableTeams.map((team) => team.id);

    return Object.values(allAnalyses).filter(
      (analysis) => analysis && viewableTeamIds.includes(analysis.teamId),
    ).length;
  }, [allAnalyses, isAdmin, getViewableTeams]);

  // Helper function to get team info
  const getTeamInfo = (teamId) => {
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
  };

  // Log toggle functions
  const toggleAllLogs = () => {
    if (openLogIds.size === analysesArray.length) {
      setOpenLogIds(new Set());
    } else {
      setOpenLogIds(new Set(analysesArray.map((analysis) => analysis.name)));
    }
  };

  const toggleLog = (analysisName) => {
    setOpenLogIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(analysisName)) {
        newSet.delete(analysisName);
      } else {
        newSet.add(analysisName);
      }
      return newSet;
    });
  };

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
              // If in reorder mode, defer deletion and update local structure only
              if (reorderMode) {
                const isTempFolder = folder.id.startsWith('temp-');

                // Only add to pending deletions if it's a real folder (not temp)
                if (!isTempFolder) {
                  setPendingFolderDeletions((prev) => [...prev, folder.id]);
                } else {
                  // For temp folders, also remove from pending folders list
                  setPendingFolders((prev) =>
                    prev.filter((f) => f.tempId !== folder.id),
                  );
                }

                // Update local structure immediately
                setLocalStructure((prev) => {
                  // Deep clone the structure to avoid mutations
                  const newStructure = structuredClone(prev);
                  const items = newStructure?.[selectedTeam]?.items || [];

                  // Find and remove the folder, moving its items to parent
                  const removeFolder = (itemsList) => {
                    for (let i = 0; i < itemsList.length; i++) {
                      const item = itemsList[i];
                      if (item.id === folder.id) {
                        // Move folder's items to parent
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

                showInfo(
                  isTempFolder
                    ? `"${folder.name}" removed from preview`
                    : `"${folder.name}" will be deleted when you click Done`,
                  isTempFolder
                    ? 'Folder Removed'
                    : 'Folder Marked for Deletion',
                );
              } else {
                // Not in reorder mode - delete immediately
                try {
                  await teamService.deleteFolder(selectedTeam, folder.id);
                  showSuccess(`Folder "${folder.name}" deleted`);
                } catch (error) {
                  showError(error.message || 'Failed to delete folder');
                }
              }
            },
          });
          break;

        default:
          logger.warn('Unknown folder action:', action);
      }
    },
    [
      selectedTeam,
      handleCreateFolder,
      reorderMode,
      setPendingFolderDeletions,
      setPendingFolders,
      setLocalStructure,
    ],
  );

  // Reorder handlers
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
      // First, delete all pending folders
      for (const folderId of pendingFolderDeletions) {
        await teamService.deleteFolder(selectedTeam, folderId);
      }

      // Then, create all pending folders
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

      // Finally, apply all pending reorders (replacing temp IDs with real ones)
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

      showSuccess('Changes applied successfully');

      setPendingReorders([]);
      setPendingFolders([]);
      setPendingFolderDeletions([]);
      setReorderMode(false);
      setLocalStructure(null);
    } catch (error) {
      logger.error('Failed to apply changes:', error);
      showError(error.message || 'Failed to apply changes');
    }
  }, [pendingReorders, pendingFolders, pendingFolderDeletions, selectedTeam]);

  // Check if user has no team access (non-admin users only)
  // Must be before early returns to satisfy React Hooks rules
  const hasNoTeamAccess = useMemo(() => {
    if (isAdmin) return false;
    const viewableTeams = getViewableTeams();
    return !viewableTeams || viewableTeams.length === 0;
  }, [isAdmin, getViewableTeams]);

  // Calculate whether there are analyses to show
  const hasAnalyses = analysesArray.length > 0;

  // Get current team info for display
  const currentTeamInfo = selectedTeam ? getTeam?.(selectedTeam) : null;

  // Handle loading state
  if (connectionStatus === 'connecting') {
    return (
      <Paper p="lg" withBorder radius="md">
        <Stack>
          <Text size="lg" fw={600}>
            Available Analyses
          </Text>
          <Center py="xl">
            <Group>
              <Loader size="sm" />
              <Text c="dimmed">Connecting to server...</Text>
            </Group>
          </Center>
        </Stack>
      </Paper>
    );
  }

  // Handle disconnected state
  if (connectionStatus === 'disconnected') {
    return (
      <Paper p="lg" withBorder radius="md">
        <Stack>
          <Text size="lg" fw={600}>
            Available Analyses
          </Text>
          <Alert
            icon={<IconInfoCircle size={16} />}
            color="red"
            variant="light"
          >
            Disconnected from server. Attempting to reconnect...
          </Alert>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="lg" withBorder radius="md">
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
                ? selectedTeam
                  ? `Showing ${analysesArray.length} of ${totalAccessibleAnalyses} analyses`
                  : `${analysesArray.length} ${analysesArray.length === 1 ? 'analysis' : ''}${analysesArray.length !== 1 ? 'analyses' : ''} available`
                : selectedTeam
                  ? 'No analyses in this team'
                  : 'No analyses available'}
            </Text>
          </Box>

          {/* Action buttons */}
          {hasAnalyses &&
            selectedTeam &&
            (reorderMode ? (
              <Group gap="xs">
                <Button
                  onClick={() => handleCreateFolder(null)}
                  variant="light"
                  size="sm"
                  color="brand"
                  leftSection={<IconFolderPlus size={16} />}
                >
                  Create Folder
                </Button>
                <Button
                  onClick={handleCancelReorder}
                  variant="light"
                  size="sm"
                  color="gray"
                  leftSection={<IconX size={16} />}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApplyReorders}
                  variant="filled"
                  size="sm"
                  color="green"
                  leftSection={<IconCheck size={16} />}
                >
                  Done
                </Button>
              </Group>
            ) : (
              <Group gap="xs">
                <Button
                  onClick={toggleAllLogs}
                  variant="light"
                  size="sm"
                  color="brand"
                  leftSection={<IconFileText size={16} />}
                >
                  {openLogIds.size === analysesArray.length
                    ? 'Close All Logs'
                    : 'Open All Logs'}
                </Button>
                <Menu position="bottom-end" withinPortal zIndex={1001}>
                  <Menu.Target>
                    <ActionIcon variant="light" size="lg" color="brand">
                      <IconDotsVertical size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconArrowsSort size={16} />}
                      onClick={() => {
                        // Capture current structure for local editing
                        setLocalStructure(structuredClone(teamStructure));
                        setReorderMode(true);
                      }}
                    >
                      Reorganize List
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            ))}
          {/* Log toggle button for non-team views */}
          {hasAnalyses && !selectedTeam && (
            <Button
              onClick={toggleAllLogs}
              variant="light"
              size="sm"
              color="brand"
              leftSection={<IconFileText size={16} />}
            >
              {openLogIds.size === analysesArray.length
                ? 'Close All Logs'
                : 'Open All Logs'}
            </Button>
          )}
        </Group>

        {/* Content */}
        <Stack gap="md">
          {hasNoTeamAccess ? (
            /* No Team Access State */
            <Center py="xl">
              <Stack align="center" gap="md">
                <Alert
                  icon={<IconUserX size={20} />}
                  color="orange"
                  variant="light"
                  style={{ maxWidth: 500 }}
                >
                  <Stack gap="sm">
                    <Text fw={500}>No Team Access</Text>
                    <Text size="sm">
                      You haven't been assigned to any teams yet. Please contact
                      an administrator to request access to the teams you need.
                    </Text>
                  </Stack>
                </Alert>
              </Stack>
            </Center>
          ) : selectedTeam ? (
            /* Tree View for selected team */
            <>
              <AnalysisTree
                key={`tree-${selectedTeam}-${reorderMode ? 'reorder' : teamStructureVersion}`}
                teamId={selectedTeam}
                teamStructure={
                  reorderMode && localStructure ? localStructure : teamStructure
                }
                analyses={allAnalyses}
                onFolderAction={handleFolderAction}
                expandedAnalyses={Object.fromEntries(
                  Array.from(openLogIds).map((id) => [id, true]),
                )}
                onToggleAnalysisLogs={toggleLog}
                reorderMode={reorderMode}
                onPendingReorder={handlePendingReorder}
              />
            </>
          ) : hasAnalyses ? (
            analysesArray.map((analysis) => {
              const teamInfo = getTeamInfo(analysis.teamId);

              return (
                <Stack key={`analysis-${analysis.name}`} gap="xs">
                  {/* Team Label (when showing all analyses) */}
                  {showTeamLabels && !selectedTeam && (
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
                    showLogs={openLogIds.has(analysis.name)}
                    onToggleLogs={() => toggleLog(analysis.name)}
                    teamInfo={showTeamLabels ? teamInfo : null}
                  />
                </Stack>
              );
            })
          ) : (
            /* Empty State */
            <Center py="xl">
              <Stack align="center" gap="md">
                <Box ta="center">
                  <Text c="dimmed" size="md" mb="xs">
                    {selectedTeam
                      ? 'No analyses found in this team'
                      : totalAccessibleAnalyses === 0
                        ? 'No analyses available'
                        : 'Loading analyses...'}
                  </Text>

                  <Text c="dimmed" size="sm">
                    {selectedTeam
                      ? 'Try selecting a different team or create a new analysis here.'
                      : totalAccessibleAnalyses === 0
                        ? 'Upload an analysis file to get started.'
                        : 'Please wait while analyses load from the server.'}
                  </Text>
                </Box>

                {/* Additional context for team view */}
                {selectedTeam && currentTeamInfo && (
                  <Alert
                    icon={<IconInfoCircle size={16} />}
                    color="blue"
                    variant="light"
                    style={{ maxWidth: 400 }}
                  >
                    You can create a new analysis for the{' '}
                    <strong>{currentTeamInfo.name}</strong> team using the
                    analysis creator above.
                  </Alert>
                )}
              </Stack>
            </Center>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

AnalysisList.propTypes = {
  analyses: PropTypes.object,
  showTeamLabels: PropTypes.bool,
  selectedTeam: PropTypes.string,
};
