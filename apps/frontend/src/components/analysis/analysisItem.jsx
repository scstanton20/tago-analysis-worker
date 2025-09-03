// frontend/src/components/analysis/analysisItem.jsx
import { useState, lazy, Suspense } from 'react';
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
  LoadingOverlay,
  Portal,
} from '@mantine/core';
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
import AnalysisLogs from './analysisLogs';
import StatusBadge from './statusBadge';
import Logo from '../logo';

// Lazy load all modal components
const AnalysisEditModal = lazy(() => import('../modals/codeMirrorCommon'));
const LogDownloadDialog = lazy(() => import('../modals/logDownload'));
const TeamSelectModal = lazy(() => import('../modals/changeTeamModal'));
const VersionManagementModal = lazy(
  () => import('../modals/versionManagement'),
);
import { useSSE } from '../../contexts/sseContext';
import { usePermissions } from '../../hooks/usePermissions';

// Custom loading overlay component
function AppLoadingOverlay({ message, submessage, error, showRetry }) {
  return (
    <Portal>
      <LoadingOverlay
        visible={true}
        zIndex={9999}
        overlayProps={{ blur: 2, radius: 'sm' }}
        loaderProps={{
          size: 'xl',
          children: (
            <Stack align="center" gap="lg">
              <Logo size={48} className={error ? '' : 'pulse'} />
              <Text size="lg" fw={500} c={error ? 'red' : undefined}>
                {message}
              </Text>
              {submessage && (
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                  {submessage}
                </Text>
              )}
              {showRetry && (
                <Button
                  onClick={() => window.location.reload()}
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                  mt="md"
                >
                  Retry Connection
                </Button>
              )}
            </Stack>
          ),
        }}
        pos="fixed"
      />
    </Portal>
  );
}

export default function AnalysisItem({ analysis, showLogs, onToggleLogs }) {
  const [editModalType, setEditModalType] = useState(null); // null, 'analysis', or 'env'
  const [showLogDownloadDialog, setShowLogDownloadDialog] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);

  const { loadingAnalyses, addLoadingAnalysis, removeLoadingAnalysis, teams } =
    useSSE();
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
      console.error('Failed to run analysis:', error);
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
      console.error('Failed to stop analysis:', error);
      removeLoadingAnalysis(analysis.name);
    }
  };

  const handleDeleteAnalysis = async () => {
    if (!window.confirm('Are you sure you want to delete this analysis?')) {
      return;
    }

    try {
      await notify.deleteAnalysis(
        analysisService.deleteAnalysis(analysis.name),
        analysis.name,
      );
    } catch (error) {
      console.error('Failed to delete analysis:', error);
    }
  };

  const handleEditAnalysis = async () => {
    if (!canViewAnalyses(analysis)) {
      return; // No permission to view analysis files
    }
    setEditModalType('analysis');
  };

  const handleEditENV = async () => {
    if (!canViewAnalyses(analysis)) {
      return; // No permission to view analysis files
    }
    setEditModalType('env');
  };

  const handleDownloadLogs = async (timeRange) => {
    try {
      await notify.executeWithNotification(
        analysisService.downloadLogs(analysis.name, timeRange),
        {
          loading: `Downloading logs for ${analysis.name}...`,
          success: 'Logs downloaded successfully.',
        },
      );
    } catch (error) {
      console.error('Failed to download logs:', error);
    }
  };

  const handleDeleteLogs = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete all logs for this analysis?',
      )
    ) {
      return;
    }

    try {
      await notify.executeWithNotification(
        analysisService.deleteLogs(analysis.name),
        {
          loading: `Deleting logs for ${analysis.name}...`,
          success: 'All logs deleted successfully.',
        },
      );

      // SSE will automatically update the logs component with empty logs
    } catch (error) {
      console.error('Failed to delete logs:', error);
    }
  };

  const handleDownloadAnalysis = async () => {
    try {
      await notify.executeWithNotification(
        analysisService.downloadAnalysis(analysis.name),
        {
          loading: `Downloading ${analysis.name}...`,
          success: 'Analysis file downloaded successfully.',
        },
      );
    } catch (error) {
      console.error('Failed to download analysis:', error);
    }
  };

  const handleTeamChange = async (teamId) => {
    try {
      await notify.executeWithNotification(
        teamService.moveAnalysisToTeam(analysis.name, teamId),
        {
          loading: `Moving ${analysis.name} to team...`,
          success: 'Analysis moved to team successfully.',
        },
      );
      setShowTeamModal(false);
    } catch (error) {
      console.error('Error moving analysis:', error);
    }
  };

  const handleVersionRollback = (version) => {
    // The rollback operation is handled by the modal
    // This callback can be used for additional UI updates if needed
    console.log(`Analysis ${analysis.name} rolled back to version ${version}`);
  };

  return (
    <Paper
      p="md"
      withBorder
      radius="md"
      className="analysis-card"
      style={{
        borderLeft: '3px solid var(--mantine-color-brand-4)',
        transition: 'all 0.3s ease',
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
                withinPortal={true}
                position="bottom-end"
                closeOnItemClick={true}
              >
                <Menu.Target>
                  <ActionIcon variant="subtle" size="lg" color="brand">
                    <IconDotsVertical size={20} />
                  </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                  {/* Team Management - Admins can move any analysis, users can move uncategorized */}
                  {(isAdmin || isUncategorized) && (
                    <>
                      <Menu.Item
                        onClick={() => setShowTeamModal(true)}
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
                        onClick={() => setShowLogDownloadDialog(true)}
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
                        onClick={() => setShowVersionModal(true)}
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
        {showLogs && <AnalysisLogs analysis={analysis} />}
      </Stack>

      {/* Edit Modal - Render if user can view analyses */}
      {editModalType && canViewAnalyses(analysis) && (
        <Suspense
          fallback={
            <AppLoadingOverlay
              message={`Loading ${editModalType === 'analysis' ? 'analysis editor' : 'environment editor'}...`}
            />
          }
        >
          <AnalysisEditModal
            analysis={analysis}
            onClose={() => setEditModalType(null)}
            readOnly={!canEditAnalyses(analysis)}
            type={editModalType}
          />
        </Suspense>
      )}
      {showLogDownloadDialog && (
        <Suspense
          fallback={
            <AppLoadingOverlay message="Loading log download options..." />
          }
        >
          <LogDownloadDialog
            isOpen={showLogDownloadDialog}
            onClose={() => setShowLogDownloadDialog(false)}
            onDownload={handleDownloadLogs}
          />
        </Suspense>
      )}
      {showTeamModal && (
        <Suspense
          fallback={<AppLoadingOverlay message="Loading team selection..." />}
        >
          <TeamSelectModal
            isOpen={showTeamModal}
            onClose={() => setShowTeamModal(false)}
            onSelect={handleTeamChange}
            teams={teamsArray}
            currentTeam={analysis.teamId || analysis.team}
            analysisName={analysis.name}
          />
        </Suspense>
      )}
      {showVersionModal && (
        <Suspense
          fallback={<AppLoadingOverlay message="Loading version history..." />}
        >
          <VersionManagementModal
            isOpen={showVersionModal}
            onClose={() => setShowVersionModal(false)}
            analysis={analysis}
            onVersionRollback={handleVersionRollback}
          />
        </Suspense>
      )}
    </Paper>
  );
}

AnalysisItem.propTypes = {
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['listener']),
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
  teamInfo: PropTypes.shape({
    name: PropTypes.string,
    color: PropTypes.string,
  }),
};
