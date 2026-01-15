import { useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Stack, Group, Text, Center, Loader } from '@mantine/core';
import { useAnalyses, useTeams, useConnection } from '@/contexts/sseContext';
import { usePermissions } from '@/features/auth/hooks/usePermissions';
import { useVisibleTeams } from '@/features/teams/hooks/useVisibleTeams';
import logger from '@/utils/logger';
import { modalService } from '@/modals/modalService';
import { ConfirmDialog } from '@/components/global';
import { FormAlert, PaperCard, ContentBox } from '@/components/global';
import { teamService } from '@/features/teams/api/teamService';
import { notificationAPI } from '@/utils/notificationService.jsx';
import { useReorderMode } from '../hooks/useReorderMode';
import AnalysisListHeader from './AnalysisListHeader';
import AnalysisListContent from './AnalysisListContent';

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

  const {
    reorderMode,
    localStructure,
    handleCreatePendingFolder,
    handlePendingReorder,
    handleCancelReorder,
    handleApplyReorders,
    enterReorderMode,
    handlePendingFolderDeletion,
  } = useReorderMode({ selectedTeam, teamStructure });

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
    const analysesToShow = analyses || {};
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
  }, [analyses, teamOrderMap]);

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
                handlePendingFolderDeletion(folder);
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
    [
      selectedTeam,
      handleCreateFolder,
      reorderMode,
      handlePendingFolderDeletion,
    ],
  );

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
        <AnalysisListHeader
          selectedTeam={selectedTeam}
          currentTeamInfo={currentTeamInfo}
          hasAnalyses={hasAnalyses}
          analysesCount={analysesArray.length}
          canUploadAnalyses={canUploadAnalyses}
          reorderMode={reorderMode}
          onCreateFolder={() => handleCreateFolder(null)}
          onCancelReorder={handleCancelReorder}
          onApplyReorders={handleApplyReorders}
          onStartReorder={enterReorderMode}
          onOpenAnalysisCreator={() =>
            modalService.openAnalysisCreator({
              targetTeam: selectedTeam,
            })
          }
        />

        <AnalysisListContent
          hasNoTeamAccess={hasNoTeamAccess}
          selectedTeam={selectedTeam}
          currentTeamInfo={currentTeamInfo}
          hasAnalyses={hasAnalyses}
          analysesArray={analysesArray}
          showTeamLabels={showTeamLabels}
          getTeamInfo={getTeamInfo}
          totalAccessibleAnalyses={totalAccessibleAnalyses}
          reorderMode={reorderMode}
          localStructure={localStructure}
          teamStructure={teamStructure}
          teamStructureVersion={teamStructureVersion}
          allAnalyses={allAnalyses}
          onFolderAction={handleFolderAction}
          onPendingReorder={handlePendingReorder}
        />
      </Stack>
    </ContentBox>
  );
}

AnalysisList.propTypes = {
  analyses: PropTypes.object,
  showTeamLabels: PropTypes.bool,
  selectedTeam: PropTypes.string,
};
