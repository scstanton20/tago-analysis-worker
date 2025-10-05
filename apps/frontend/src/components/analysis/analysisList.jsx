// frontend/src/components/analysis/analysisList.jsx
import { useState, useMemo, useCallback } from 'react';
import { useSSE } from '../../contexts/sseContext';
import { usePermissions } from '../../hooks/usePermissions';
import AnalysisItem from './analysisItem';
import AnalysisTree from './analysisTree';
import CreateFolderModal from '../modals/createFolderModal';
import RenameFolderModal from '../modals/renameFolderModal';
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
import { notifications } from '@mantine/notifications';
import teamService from '../../services/teamService';

export default function AnalysisList({
  analyses = null,
  showTeamLabels = false,
  selectedTeam = null,
}) {
  const {
    analyses: allAnalyses = {},
    teamStructure,
    connectionStatus,
    getTeam,
  } = useSSE();

  const { accessibleTeams, isAdmin } = usePermissions();

  const [openLogIds, setOpenLogIds] = useState(new Set());
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [pendingReorders, setPendingReorders] = useState([]);
  const [reorderModeKey, setReorderModeKey] = useState(0);
  const [localStructure, setLocalStructure] = useState(null);
  const [pendingFolders, setPendingFolders] = useState([]);

  // Handler for creating pending folders in reorder mode
  const handleCreatePendingFolder = useCallback(
    (folderInfo) => {
      const tempId = `temp-${crypto.randomUUID()}`;
      const newFolder = {
        id: tempId,
        type: 'folder',
        name: folderInfo.name,
        items: [],
      };

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
      setLocalStructure((prev) => {
        const newStructure = JSON.parse(JSON.stringify(prev));
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
      });

      // Restart animations
      setReorderModeKey((prev) => prev + 1);
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

    // Non-admin: count only analyses in accessible teams (uncategorized is just a regular team)
    const accessibleTeamIds = accessibleTeams?.map((team) => team.id) || [];

    return Object.values(allAnalyses).filter(
      (analysis) => analysis && accessibleTeamIds.includes(analysis.teamId),
    ).length;
  }, [allAnalyses, isAdmin, accessibleTeams]);

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
    console.warn(`Team ${teamId} not found`);
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
  const handleCreateFolder = useCallback((parentFolder = null) => {
    setCurrentFolder(parentFolder);
    setFolderModalOpen(true);
  }, []);

  const handleFolderAction = useCallback(
    async (action, folder) => {
      switch (action) {
        case 'createSubfolder':
          handleCreateFolder(folder);
          break;

        case 'rename':
          setCurrentFolder(folder);
          setRenameModalOpen(true);
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
              try {
                await teamService.deleteFolder(selectedTeam, folder.id);
                notifications.show({
                  title: 'Success',
                  message: `Folder "${folder.name}" deleted`,
                  color: 'green',
                });
              } catch (error) {
                notifications.show({
                  title: 'Error',
                  message: error.message || 'Failed to delete folder',
                  color: 'red',
                });
              }
            },
          });
          break;

        default:
          console.warn('Unknown folder action:', action);
      }
    },
    [selectedTeam, handleCreateFolder],
  );

  // Helper to find item and its parent in structure
  const findItemWithParent = useCallback((items, itemId, parent = null) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.id === itemId) {
        return { item, parent, index: i };
      }
      if (item.type === 'folder' && item.items) {
        const found = findItemWithParent(item.items, itemId, item);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Apply a single reorder to a structure (returns new structure)
  const applyReorderToStructure = useCallback(
    (structure, reorder) => {
      const items = structure?.[selectedTeam]?.items || [];
      const newItems = JSON.parse(JSON.stringify(items)); // Deep clone

      // Find the item to move
      const activeInfo = findItemWithParent(newItems, reorder.itemId);
      if (!activeInfo) return structure;

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

      const itemToMove = removeFromParent(newItems, reorder.itemId);
      if (!itemToMove) return structure;

      // Insert item at new location
      if (reorder.targetParentId) {
        // Find target folder and insert
        const findAndInsert = (items) => {
          for (const item of items) {
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
        findAndInsert(newItems);
      } else {
        // Insert at root level
        newItems.splice(reorder.targetIndex, 0, itemToMove);
      }

      return {
        ...structure,
        [selectedTeam]: {
          ...structure[selectedTeam],
          items: newItems,
        },
      };
    },
    [selectedTeam, findItemWithParent],
  );

  // Reorder handlers
  const handlePendingReorder = useCallback(
    (reorderInfo) => {
      setPendingReorders((prev) => [...prev, reorderInfo]);
      // Apply to local structure immediately
      setLocalStructure((prev) => applyReorderToStructure(prev, reorderInfo));
    },
    [applyReorderToStructure],
  );

  const handleCancelReorder = useCallback(() => {
    setPendingReorders([]);
    setPendingFolders([]);
    setReorderMode(false);
    setReorderModeKey(0);
    setLocalStructure(null);
  }, []);

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
      console.error('Failed to apply changes:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to apply changes',
        color: 'red',
      });
    }
  }, [pendingReorders, pendingFolders, selectedTeam]);

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

  const hasAnalyses = analysesArray.length > 0;

  // Check if user has no team access (non-admin users only)
  const hasNoTeamAccess =
    !isAdmin && (!accessibleTeams || accessibleTeams.length === 0);

  // Get current team info for display
  const currentTeamInfo = selectedTeam ? getTeam?.(selectedTeam) : null;

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
                <Menu position="bottom-end" withinPortal>
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
                        setLocalStructure(
                          JSON.parse(JSON.stringify(teamStructure)),
                        );
                        setReorderMode(true);
                        setReorderModeKey((prev) => prev + 1);
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
                reorderModeKey={reorderModeKey}
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

      {/* Create Folder Modal */}
      {selectedTeam && (
        <>
          <CreateFolderModal
            opened={folderModalOpen}
            onClose={() => {
              setFolderModalOpen(false);
              setCurrentFolder(null);
            }}
            teamId={selectedTeam}
            parentFolderId={currentFolder?.id}
            parentFolderName={currentFolder?.name}
            onCreatePending={reorderMode ? handleCreatePendingFolder : null}
          />
          <RenameFolderModal
            opened={renameModalOpen}
            onClose={() => {
              setRenameModalOpen(false);
              setCurrentFolder(null);
            }}
            teamId={selectedTeam}
            folderId={currentFolder?.id || ''}
            currentName={currentFolder?.name || ''}
          />
        </>
      )}
    </Paper>
  );
}
