import { lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import {
  Paper,
  Group,
  Text,
  Button,
  Menu,
  ActionIcon,
  Badge,
  Stack,
  Box,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconFileText,
  IconDownload,
  IconEdit,
  IconTrash,
  IconDotsVertical,
  IconFolderPlus,
  IconFolderCog,
  IconHistory,
} from '@tabler/icons-react';
import { analysisService } from '../../services/analysisService';
import { teamService } from '../../services/teamService';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import StatusBadge from './statusBadge';
import logger from '../../utils/logger';
import AppLoadingOverlay from '../common/AppLoadingOverlay';

// Lazy load AnalysisLogs
const AnalysisLogs = lazy(() => import('./analysisLogs'));
import { useAnalyses, useTeams } from '../../contexts/sseContext';
import { usePermissions } from '../../hooks/usePermissions';
import { modalService } from '../../modals/modalService';

export default function AnalysisItem({
  analysis,
  showLogs,
  onToggleLogs,
  reorderMode = false,
}) {
  const { loadingAnalyses, addLoadingAnalysis, removeLoadingAnalysis } =
    useAnalyses();
  const { teams } = useTeams();
  const {
    canRunAnalyses,
    canViewAnalyses,
    canEditAnalyses,
    canDeleteAnalyses,
    canDownloadAnalyses,
    canAccessTeam,
    isAdmin,
  } = usePermissions();
  const notify = useNotifications();
  const isLoading = loadingAnalyses.has(analysis.name);

  if (!analysis || !analysis.name) {
    return null;
  }

  // Get current team info
  const allTeams = Array.isArray(teams) ? teams : Object.values(teams || {});

  // Filter teams based on user permissions (admins see all, users see only accessible ones)
  const teamsArray = isAdmin
    ? allTeams
    : allTeams.filter((team) => canAccessTeam(team.id));
  const currentTeam = teamsArray.find(
    (t) => t.id === (analysis.teamId || analysis.team),
  );
  const isUncategorized =
    (!analysis.teamId && !analysis.team) ||
    analysis.teamId === 'uncategorized' ||
    analysis.team === 'uncategorized';

  const handleRun = async () => {
    addLoadingAnalysis(analysis.name);
    try {
      await notify.runAnalysis(
        analysisService.runAnalysis(analysis.name),
        analysis.name,
      );
    } catch (error) {
      logger.error('Failed to run analysis:', error);
      removeLoadingAnalysis(analysis.name);
    }
  };

  const handleStop = async () => {
    addLoadingAnalysis(analysis.name);
    try {
      await notify.stopAnalysis(
        analysisService.stopAnalysis(analysis.name),
        analysis.name,
      );
    } catch (error) {
      logger.error('Failed to stop analysis:', error);
      removeLoadingAnalysis(analysis.name);
    }
  };

  const handleDeleteAnalysis = async () => {
    modals.openConfirmModal({
      title: 'Delete Analysis',
      children: `Are you sure you want to delete "${analysis.name}"? This action cannot be undone.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await notify.deleteAnalysis(
            analysisService.deleteAnalysis(analysis.name),
            analysis.name,
          );
        } catch (error) {
          logger.error('Failed to delete analysis:', error);
        }
      },
    });
  };

  const handleEditAnalysis = async () => {
    if (!canViewAnalyses(analysis)) {
      return; // No permission to view analysis files
    }
    modalService.openAnalysisEditor(analysis, {
      readOnly: !canEditAnalyses(analysis),
      type: 'analysis',
    });
  };

  const handleEditENV = async () => {
    if (!canViewAnalyses(analysis)) {
      return; // No permission to view analysis files
    }
    modalService.openAnalysisEditor(analysis, {
      readOnly: !canEditAnalyses(analysis),
      type: 'env',
    });
  };

  const handleDownloadLogs = async (timeRange) => {
    try {
      await notify.downloadLogs(
        analysisService.downloadLogs(analysis.name, timeRange),
        analysis.name,
        timeRange,
      );
    } catch (error) {
      logger.error('Failed to download logs:', error);
    }
  };

  const handleDeleteLogs = async () => {
    modals.openConfirmModal({
      title: 'Delete All Logs',
      children: `Are you sure you want to delete all logs for "${analysis.name}"? This action cannot be undone.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await notify.deleteLogs(
            analysisService.deleteLogs(analysis.name),
            analysis.name,
          );

          // SSE will automatically update the logs component with empty logs
        } catch (error) {
          logger.error('Failed to delete logs:', error);
        }
      },
    });
  };

  const handleDownloadAnalysis = async () => {
    try {
      await notify.downloadAnalysis(
        analysisService.downloadAnalysis(analysis.name),
        analysis.name,
      );
    } catch (error) {
      logger.error('Failed to download analysis:', error);
    }
  };

  const handleTeamChange = async (teamId) => {
    try {
      const targetTeam = teamsArray.find((t) => t.id === teamId);
      const teamName = targetTeam?.name || 'selected team';

      await notify.moveAnalysis(
        teamService.moveAnalysisToTeam(analysis.name, teamId),
        analysis.name,
        teamName,
      );
      // Modal will close automatically after successful move
    } catch (error) {
      logger.error('Error moving analysis:', error);
    }
  };

  const handleVersionRollback = (version) => {
    // The rollback operation is handled by the modal
    // This callback can be used for additional UI updates if needed
    logger.log(`Analysis ${analysis.name} rolled back to version ${version}`);
  };

  return (
    <Paper
      p="md"
      withBorder
      radius="md"
      className="analysis-card"
      onClick={
        !reorderMode
          ? (e) => {
              // Don't toggle if clicking on buttons or interactive elements
              if (
                e.target.closest('button') ||
                e.target.closest('[role="button"]') ||
                e.target.closest('a')
              ) {
                return;
              }
              onToggleLogs();
            }
          : undefined
      }
      style={{
        borderLeft: '3px solid var(--mantine-color-brand-4)',
        transition: 'all 0.3s ease',
        cursor: !reorderMode ? 'pointer' : 'default',
      }}
    >
      <Stack>
        <Group justify="space-between">
          <Group>
            <Box
              px="sm"
              py="xs"
              style={{
                backgroundColor: 'var(--mantine-color-brand-9)',
                borderRadius: 'var(--mantine-radius-sm)',
                border: '1px solid var(--mantine-color-brand-7)',
              }}
            >
              <Text fw={600} size="md" c="white">
                {analysis.name}
              </Text>
            </Box>
            <StatusBadge status={analysis.status || 'stopped'} />
            {currentTeam && (
              <Badge
                variant="light"
                color="brand"
                size="sm"
                leftSection={
                  <Box
                    w={8}
                    h={8}
                    style={{
                      borderRadius: '50%',
                      backgroundColor: currentTeam.color,
                    }}
                  />
                }
              >
                {currentTeam.name}
              </Badge>
            )}
          </Group>

          <Group gap="xs">
            {/* Primary Actions */}
            {canRunAnalyses(analysis) &&
              (analysis.status === 'running' ? (
                <Button
                  onClick={handleStop}
                  loading={isLoading}
                  color="red"
                  size="xs"
                  leftSection={<IconPlayerStop size={16} />}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={handleRun}
                  loading={isLoading}
                  variant="gradient"
                  gradient={{ from: 'teal.6', to: 'green.6' }}
                  size="xs"
                  leftSection={<IconPlayerPlay size={16} />}
                >
                  Run
                </Button>
              ))}

            {/* Log Actions */}
            <Button
              onClick={onToggleLogs}
              variant="light"
              color="brand"
              size="xs"
              leftSection={<IconFileText size={16} />}
            >
              {showLogs ? 'Hide Logs' : 'Show Logs'}
            </Button>

            {/* Show menu if user has any permissions */}
            {(isAdmin ||
              canViewAnalyses(analysis) ||
              canDownloadAnalyses(analysis) ||
              canEditAnalyses(analysis) ||
              canDeleteAnalyses(analysis)) && (
              <Menu
                shadow="md"
                width={200}
                withinPortal
                zIndex={1001}
                position="bottom-end"
                closeOnItemClick={true}
              >
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    color="brand"
                    aria-label={`Actions for ${analysis.name}`}
                  >
                    <IconDotsVertical size={20} aria-hidden="true" />
                  </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                  {/* Team Management - Admins can move any analysis, users can move uncategorized */}
                  {(isAdmin || isUncategorized) && (
                    <>
                      <Menu.Item
                        onClick={() =>
                          modalService.openChangeTeam(
                            handleTeamChange,
                            teamsArray,
                            analysis.teamId || analysis.team,
                            analysis.name,
                          )
                        }
                        leftSection={
                          isUncategorized ? (
                            <IconFolderPlus size={16} />
                          ) : (
                            <IconFolderCog size={16} />
                          )
                        }
                      >
                        {isUncategorized ? 'Add to Team' : 'Change Team'}
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  )}

                  {/* File Operations */}
                  {canDownloadAnalyses(analysis) && (
                    <>
                      <Menu.Item
                        onClick={handleDownloadAnalysis}
                        leftSection={<IconDownload size={16} />}
                      >
                        Download Analysis File
                      </Menu.Item>
                      <Menu.Item
                        onClick={() =>
                          modalService.openLogDownload(
                            analysis,
                            handleDownloadLogs,
                          )
                        }
                        leftSection={<IconDownload size={16} />}
                      >
                        Download Logs
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  )}

                  {/* Version Management */}
                  {canViewAnalyses(analysis) && (
                    <>
                      <Menu.Item
                        onClick={() =>
                          modalService.openVersionHistory(
                            analysis,
                            handleVersionRollback,
                          )
                        }
                        leftSection={<IconHistory size={16} />}
                      >
                        Version History
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  )}

                  {/* Analysis File Operations - Show view or edit based on permissions */}
                  {canViewAnalyses(analysis) && (
                    <>
                      <Menu.Item
                        onClick={handleEditAnalysis}
                        leftSection={
                          canEditAnalyses(analysis) ? (
                            <IconEdit size={16} />
                          ) : (
                            <IconFileText size={16} />
                          )
                        }
                      >
                        {canEditAnalyses(analysis)
                          ? 'Edit Analysis'
                          : 'View Analysis File'}
                      </Menu.Item>
                      <Menu.Item
                        onClick={handleEditENV}
                        leftSection={
                          canEditAnalyses(analysis) ? (
                            <IconEdit size={16} />
                          ) : (
                            <IconFileText size={16} />
                          )
                        }
                      >
                        {canEditAnalyses(analysis)
                          ? 'Edit Environment'
                          : 'View Environment'}
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  )}

                  {/* Destructive Operations */}
                  {canDeleteAnalyses(analysis) && (
                    <>
                      <Menu.Item
                        onClick={handleDeleteLogs}
                        color="red"
                        leftSection={<IconTrash size={16} />}
                      >
                        Clear/Delete All Logs
                      </Menu.Item>
                      <Menu.Item
                        onClick={handleDeleteAnalysis}
                        color="red"
                        leftSection={<IconTrash size={16} />}
                      >
                        Delete Analysis
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>

        {/* Logs Section */}
        {showLogs && (
          <Suspense fallback={<AppLoadingOverlay message="Loading logs..." />}>
            <AnalysisLogs analysis={analysis} />
          </Suspense>
        )}
      </Stack>
    </Paper>
  );
}

AnalysisItem.propTypes = {
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
    status: PropTypes.string,
    team: PropTypes.string,
    logs: PropTypes.arrayOf(
      PropTypes.shape({
        timestamp: PropTypes.string,
        message: PropTypes.string,
      }),
    ),
  }).isRequired,
  showLogs: PropTypes.bool.isRequired,
  onToggleLogs: PropTypes.func.isRequired,
  reorderMode: PropTypes.bool,
};
