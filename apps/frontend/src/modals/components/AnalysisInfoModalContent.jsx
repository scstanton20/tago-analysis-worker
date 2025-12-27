/**
 * Modal content for displaying analysis metadata and information
 * Uses SSE for real-time data (status, metrics, DNS) with API fallback
 * for file-based metadata (file stats, env stats, version history).
 * @module modals/components/AnalysisInfoModalContent
 */
import { useMemo, useEffect } from 'react';
import {
  Stack,
  Group,
  Text,
  SimpleGrid,
  Paper,
  Badge,
  Divider,
  Box,
  ThemeIcon,
  Tooltip,
  Skeleton,
} from '@mantine/core';
import {
  IconFile,
  IconFileText,
  IconVariable,
  IconHistory,
  IconUsers,
  IconCpu,
  IconDatabase,
  IconNotes,
  IconClock,
  IconTransfer,
  IconAlertCircle,
  IconExternalLink,
} from '@tabler/icons-react';
import {
  FormAlert,
  SecondaryButton,
  CancelButton,
  UtilityButton,
} from '../../components/global';
import { modals } from '@mantine/modals';
import { analysisService } from '../../services/analysisService';
import { useAsyncMountOnce } from '../../hooks/async/useAsyncMount';
import { modalService } from '../modalService';
import {
  useAnalyses,
  useBackend,
  useTeams,
  useConnection,
} from '../../contexts/sseContext';
import { usePermissions } from '../../hooks/usePermissions';
import PropTypes from 'prop-types';

/**
 * Info Card component for displaying grouped metadata
 */
function InfoCard({
  icon,
  title,
  children,
  loading = false,
  onClick,
  headerAction,
  tooltip,
}) {
  const card = (
    <Paper
      withBorder
      p="sm"
      radius="md"
      h="100%"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <Group gap="xs" mb="xs" justify="space-between">
        <Group gap="xs">
          <ThemeIcon color="brand" size="sm">
            {icon}
          </ThemeIcon>
          <Text fw={600} size="sm">
            {title}
          </Text>
        </Group>
        {headerAction}
      </Group>
      {loading ? (
        <Stack gap={4}>
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </Stack>
      ) : (
        children
      )}
    </Paper>
  );

  if (tooltip) {
    return (
      <Tooltip label={tooltip}>
        <Box>{card}</Box>
      </Tooltip>
    );
  }

  return card;
}

InfoCard.propTypes = {
  icon: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  loading: PropTypes.bool,
  onClick: PropTypes.func,
  headerAction: PropTypes.node,
  tooltip: PropTypes.string,
};

/**
 * Info Row component for displaying key-value pairs
 */
function InfoRow({ label, value, mono = false }) {
  return (
    <Group justify="space-between" gap="xs">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text
        size="sm"
        fw={500}
        ff={mono ? 'monospace' : undefined}
        component="span"
      >
        {value ?? 'N/A'}
      </Text>
    </Group>
  );
}

InfoRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.node,
  ]),
  mono: PropTypes.bool,
};

/**
 * Format a date string to a readable format
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format bytes to human-readable file size
 */
function formatFileSize(bytes) {
  if (bytes === 0 || bytes == null) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Analysis Info Modal Content Component
 * Displays comprehensive metadata about an analysis using SSE + API hybrid approach
 */
function AnalysisInfoModalContent({ id, innerProps }) {
  const { analysis, onNotesUpdated } = innerProps;

  // SSE hooks for real-time data
  const { getAnalysis, getAnalysisDnsStats } = useAnalyses();
  const { metricsData } = useBackend();
  const { teams } = useTeams();
  const { subscribeToAnalysis, unsubscribeFromAnalysis, sessionId } =
    useConnection();

  // Check admin permissions
  const { isAdmin } = usePermissions();

  // Subscribe to analysis log channel for real-time log stats
  useEffect(() => {
    if (!sessionId || !analysis.id) return;

    subscribeToAnalysis([analysis.id]);

    return () => {
      unsubscribeFromAnalysis([analysis.id]);
    };
  }, [analysis.id, sessionId, subscribeToAnalysis, unsubscribeFromAnalysis]);

  // Get real-time analysis data from SSE
  const sseAnalysis = getAnalysis(analysis.id);

  // Get real-time metrics for this analysis from SSE
  const processes = metricsData?.processes;
  const processMetrics = useMemo(() => {
    if (!processes) return null;
    const processData = processes.find((p) => p.analysis_id === analysis.id);
    if (processData) {
      return {
        cpu: processData.cpu || 0,
        memory: processData.memory || 0,
        uptime: processData.uptime || 0,
      };
    }
    return null;
  }, [processes, analysis.id]);

  // Get per-analysis DNS stats from SSE (pushed on channel subscription)
  const sseDnsStats = getAnalysisDnsStats(analysis.id);

  // Format DNS stats for display (SSE returns stats with enabled flag)
  const dnsStats = useMemo(() => {
    // Only show if we have stats and DNS cache is enabled
    if (!sseDnsStats?.enabled) return null;

    return {
      enabled: true,
      hits: sseDnsStats.hits || 0,
      misses: sseDnsStats.misses || 0,
      hitRate: sseDnsStats.hitRate || 0,
      hostnameCount: sseDnsStats.hostnameCount || 0,
      errors: sseDnsStats.errors || 0,
    };
  }, [sseDnsStats]);

  // Get team info from SSE
  const teamInfo = useMemo(() => {
    const teamId = sseAnalysis?.teamId;
    if (!teamId) return { id: null, name: 'Uncategorized' };
    const team = teams[teamId];
    return {
      id: teamId,
      name: team?.name || 'Unknown',
    };
  }, [sseAnalysis?.teamId, teams]);

  // Fetch file-based metadata from API (not available in SSE)
  const {
    loading: metaLoading,
    error: metaError,
    data: fileMeta,
  } = useAsyncMountOnce(async () =>
    analysisService.getAnalysisMeta(analysis.id),
  );

  const handleEditNotes = () => {
    modalService.openAnalysisNotes(analysis, () => {
      if (onNotesUpdated) {
        onNotesUpdated();
      }
    });
  };

  // Use SSE data for real-time fields, fallback to API data
  const status = sseAnalysis?.status || fileMeta?.process?.status || 'unknown';
  const enabled = sseAnalysis?.enabled ?? fileMeta?.process?.enabled ?? false;
  const analysisName =
    sseAnalysis?.name || fileMeta?.analysisName || analysis.name;
  const totalLogCount =
    sseAnalysis?.totalLogCount ?? fileMeta?.logs?.totalCount ?? 0;
  const logFileSize = sseAnalysis?.logFileSize ?? fileMeta?.logs?.size ?? 0;
  const currentVersion =
    sseAnalysis?.currentVersion ?? fileMeta?.versions?.currentVersion ?? 1;
  const lastStartTime =
    sseAnalysis?.startTime || fileMeta?.process?.lastStartTime;

  // Show error only if both SSE and API failed
  if (!sseAnalysis && metaError) {
    return (
      <Stack>
        <FormAlert
          type="error"
          message={metaError?.message || 'Failed to load analysis information'}
        />
        <CancelButton onClick={() => modals.close(id)}>Close</CancelButton>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Header with analysis name and status */}
      <Group justify="space-between">
        <Group gap="xs">
          <Text fw={600} size="lg">
            {analysisName}
          </Text>
          <Badge
            color={
              status === 'running'
                ? 'green'
                : status === 'error'
                  ? 'red'
                  : 'gray'
            }
            variant="filled"
          >
            {status}
          </Badge>
        </Group>
        <Group gap="xs">
          {/* Show View Notes for everyone if notes exist, Add Notes only for admins */}
          {(fileMeta?.notes?.exists || isAdmin) && (
            <SecondaryButton
              leftSection={<IconNotes size={16} />}
              onClick={handleEditNotes}
              disabled={metaLoading}
            >
              {fileMeta?.notes?.exists ? 'View Notes' : 'Add Notes'}
            </SecondaryButton>
          )}
        </Group>
      </Group>

      <Divider />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Analysis File Info - from API */}
        <InfoCard
          icon={<IconFile size={14} />}
          title="Analysis File"
          loading={metaLoading}
        >
          <Stack gap={4}>
            <InfoRow label="File Size" value={fileMeta?.file?.sizeFormatted} />
            <InfoRow
              label="Lines of Code"
              value={fileMeta?.file?.lineCount?.toLocaleString()}
            />
            <InfoRow
              label="Created"
              value={formatDate(fileMeta?.file?.created)}
            />
            <InfoRow
              label="Last Modified"
              value={formatDate(fileMeta?.file?.modified)}
            />
          </Stack>
        </InfoCard>

        {/* Environment Info - from API */}
        <InfoCard
          icon={<IconVariable size={14} />}
          title="Environment"
          loading={metaLoading}
        >
          <Stack gap={4}>
            <InfoRow
              label="Variables"
              value={fileMeta?.environment?.variableCount}
            />
            <InfoRow
              label="File Size"
              value={fileMeta?.environment?.sizeFormatted}
            />
            <InfoRow label="Lines" value={fileMeta?.environment?.lineCount} />
          </Stack>
        </InfoCard>

        {/* Logs Info - real-time from SSE with API fallback */}
        <InfoCard icon={<IconFileText size={14} />} title="Logs">
          <Stack gap={4}>
            <InfoRow
              label="Log File Size"
              value={formatFileSize(logFileSize)}
            />
            <InfoRow
              label="Total Log Entries"
              value={totalLogCount.toLocaleString()}
            />
          </Stack>
        </InfoCard>

        {/* Version Info - version count from API, current version from SSE */}
        <InfoCard
          icon={<IconHistory size={14} />}
          title="Version History"
          loading={metaLoading}
        >
          <Stack gap={4}>
            <InfoRow label="Total Versions" value={fileMeta?.versions?.count} />
            <InfoRow label="Current Version" value={`v${currentVersion}`} />
            <InfoRow
              label="First Version"
              value={formatDate(fileMeta?.versions?.firstVersionDate)}
            />
            <InfoRow
              label="Latest Version"
              value={formatDate(fileMeta?.versions?.lastVersionDate)}
            />
          </Stack>
        </InfoCard>

        {/* Team Info - from SSE */}
        <InfoCard icon={<IconUsers size={14} />} title="Team">
          <Stack gap={4}>
            <InfoRow label="Team Name" value={teamInfo.name} />
            <InfoRow label="Team ID" value={teamInfo.id} mono />
          </Stack>
        </InfoCard>

        {/* Process Info - mostly from SSE */}
        <InfoCard icon={<IconCpu size={14} />} title="Process">
          <Stack gap={4}>
            <InfoRow
              label="Status"
              value={
                <Badge
                  size="xs"
                  color={
                    status === 'running'
                      ? 'green'
                      : status === 'error'
                        ? 'red'
                        : 'gray'
                  }
                >
                  {status}
                </Badge>
              }
            />
            <InfoRow label="Enabled" value={enabled ? 'Yes' : 'No'} />
            <InfoRow
              label="Intended State"
              value={fileMeta?.process?.intendedState}
            />
            <InfoRow
              label="Restart Attempts"
              value={fileMeta?.process?.restartAttempts}
            />
          </Stack>
        </InfoCard>

        {/* Performance Metrics - from SSE (real-time) */}
        {(processMetrics || status === 'running') && (
          <InfoCard icon={<IconDatabase size={14} />} title="Performance">
            <Stack gap={4}>
              <InfoRow
                label="CPU Usage"
                value={`${processMetrics?.cpu?.toFixed(1) || 0}%`}
              />
              <InfoRow
                label="Memory"
                value={`${processMetrics?.memory?.toFixed(1) || 0} MB`}
              />
              <InfoRow
                label="Uptime"
                value={`${Math.floor((processMetrics?.uptime || 0) / 60)} min`}
              />
            </Stack>
          </InfoCard>
        )}

        {/* DNS Cache Info - from SSE (real-time per-analysis stats) - clickable to open DNS settings (admin only) */}
        {dnsStats?.enabled && (
          <InfoCard
            icon={<IconTransfer size={14} />}
            title="DNS Cache"
            tooltip={isAdmin ? 'Click to view detailed DNS stats' : undefined}
            onClick={
              isAdmin
                ? () => {
                    modals.close(id);
                    modalService.openSettings({
                      initialTab: 'dns',
                      focusAnalysisId: analysis.id,
                    });
                  }
                : undefined
            }
            headerAction={
              isAdmin ? (
                <Tooltip label="Open DNS Settings">
                  <UtilityButton
                    size="xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      modals.close(id);
                      modalService.openSettings({
                        initialTab: 'dns',
                        focusAnalysisId: analysis.id,
                      });
                    }}
                  >
                    <IconExternalLink size={14} />
                  </UtilityButton>
                </Tooltip>
              ) : undefined
            }
          >
            <Stack gap={4}>
              <InfoRow
                label="Hit Rate"
                value={`${Number(dnsStats.hitRate).toFixed(1)}%`}
              />
              <InfoRow
                label="Hits / Misses"
                value={`${dnsStats.hits} / ${dnsStats.misses}`}
              />
              <InfoRow label="Hostnames" value={dnsStats.hostnameCount} />
            </Stack>
          </InfoCard>
        )}
      </SimpleGrid>

      {/* Footer with timestamps */}
      <Divider />
      <Box>
        <Group gap="lg">
          <Group gap={4}>
            <IconClock size={14} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              Last Start: {formatDate(lastStartTime)}
            </Text>
          </Group>
          <Tooltip
            label="The unique identifier of an analysis related to this worker application only. This does not match the analysis ID in Tago.io."
            multiline
            w={250}
          >
            <Group gap={4} style={{ cursor: 'help' }}>
              <IconAlertCircle size={14} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed" ff="monospace">
                ID: {analysis.id}
              </Text>
            </Group>
          </Tooltip>
        </Group>
      </Box>

      {/* Close Button */}
      <Group justify="flex-end">
        <CancelButton onClick={() => modals.close(id)}>Close</CancelButton>
      </Group>
    </Stack>
  );
}

AnalysisInfoModalContent.propTypes = {
  id: PropTypes.string.isRequired,
  innerProps: PropTypes.shape({
    analysis: PropTypes.object.isRequired,
    onNotesUpdated: PropTypes.func,
  }).isRequired,
};

export default AnalysisInfoModalContent;
