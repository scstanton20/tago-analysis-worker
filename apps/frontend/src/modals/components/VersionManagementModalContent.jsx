/**
 * Version Management modal content component
 * Manages viewing and rolling back to previous versions of an analysis
 * @module modals/components/VersionManagementModalContent
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Stack,
  Text,
  Button,
  Group,
  Table,
  Badge,
  Alert,
  ActionIcon,
  Divider,
  Box,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconHistory,
  IconDownload,
  IconPlayerPlay,
  IconInfoCircle,
  IconClock,
  IconFileText,
  IconEyeCode,
} from '@tabler/icons-react';
import { analysisService } from '../../services/analysisService';
import { useNotifications } from '../../hooks/useNotifications';
import { useAsyncOperation } from '../../hooks/async/useAsyncOperation';
import { modalService } from '../modalService';
import { IconLabel, LoadingState } from '../../components/global';
import logger from '../../utils/logger';
import PropTypes from 'prop-types';

/**
 * VersionManagementModalContent
 * Content component for version management modal
 *
 * @param {Object} props - Component props
 * @param {Object} props.context - Mantine modal context
 * @param {string} props.id - Modal ID
 * @param {Object} props.innerProps - Modal inner props
 * @param {Object} props.innerProps.analysis - Analysis object
 * @param {Function} props.innerProps.onVersionRollback - Callback after version rollback
 * @returns {JSX.Element} Modal content
 */
function VersionManagementModalContent({ context, id, innerProps }) {
  const { analysis, onVersionRollback } = innerProps;
  const [versionData, setVersionData] = useState({
    versions: [],
    nextVersionNumber: 2,
    currentVersion: 1,
  });
  const [rollbackLoading, setRollbackLoading] = useState(null);
  const notify = useNotifications();
  const loadVersionsOperation = useAsyncOperation();
  const downloadOperation = useAsyncOperation();

  const loadVersions = useCallback(async () => {
    await loadVersionsOperation.execute(async () => {
      const data = await analysisService.getVersions(analysis.name);
      setVersionData(data);
    });
  }, [analysis.name, loadVersionsOperation]);

  // Load versions when component mounts (modal opens)
  useEffect(() => {
    if (analysis?.name) {
      loadVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Update modal title dynamically
  useEffect(() => {
    context.updateModal({
      title: (
        <IconLabel
          icon={<IconHistory size={20} aria-hidden="true" />}
          label={`Version History - ${analysis?.name}`}
          fw={600}
        />
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Set once on mount (analysis.name doesn't change for this modal)

  const handleRollback = async (version) => {
    modals.openConfirmModal({
      title: 'Rollback to Previous Version',
      children: `Are you sure you want to rollback "${analysis.name}" to version ${version}? This will clear the current logs and restart the analysis if it's running.`,
      labels: { confirm: 'Rollback', cancel: 'Cancel' },
      confirmProps: { color: 'orange' },
      onConfirm: async () => {
        setRollbackLoading(version);
        try {
          await notify.executeWithNotification(
            analysisService.rollbackToVersion(analysis.name, version),
            {
              loading: `Rolling back ${analysis.name} to version ${version}...`,
              success: `Successfully rolled back to version ${version}`,
            },
          );

          if (onVersionRollback) {
            onVersionRollback(version);
          }

          // Reload versions to update current version indicator
          await loadVersions();
        } catch (error) {
          logger.error('Failed to rollback:', error);
        } finally {
          setRollbackLoading(null);
        }
      },
    });
  };

  const handleDownloadVersion = async (version) => {
    await downloadOperation.execute(async () => {
      await notify.executeWithNotification(
        analysisService.downloadAnalysis(analysis.name, version),
        {
          loading: `Downloading version ${version} of ${analysis.name}...`,
          success: 'Version downloaded successfully',
        },
      );
    });
  };

  const handleViewVersion = (version) => {
    // Open AnalysisEditModal on top of this modal using modalService
    // Mantine handles z-index stacking automatically
    modalService.openAnalysisEditor(analysis, {
      readOnly: true,
      type: 'analysis',
      version,
      showDiffToggle: version !== 0, // Only show diff toggle for non-current versions
    });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Memoize current version to prevent unnecessary recalculations
  const currentVersionNumber = useMemo(
    () => versionData.currentVersion,
    [versionData.currentVersion],
  );

  // Memoize sorted versions to prevent unnecessary array operations
  const sortedVersions = useMemo(
    () =>
      [...versionData.versions]
        .filter((version) => version.version !== currentVersionNumber)
        .sort((a, b) => b.version - a.version),
    [versionData.versions, currentVersionNumber],
  );

  return (
    <Box pos="relative">
      <Stack gap="md">
        <Alert
          icon={<IconInfoCircle size={16} />}
          title="Version Management"
          color="blue"
          variant="light"
        >
          <Text size="sm">
            Each time you save changes to this analysis, a new version is
            automatically created. You can rollback to any previous version,
            which will clear the logs and restart the analysis if running.
            Environment variables remain unchanged during rollback.
          </Text>
        </Alert>

        {loadVersionsOperation.loading ? (
          <LoadingState loading={true} minHeight={200} />
        ) : versionData.versions.length === 0 ? (
          <Alert
            icon={<IconInfoCircle size={16} />}
            title="No Version History"
            color="yellow"
            variant="light"
          >
            <Text size="sm">
              No previous versions found. Versions will be created automatically
              when you make changes to the analysis.
            </Text>
          </Alert>
        ) : (
          <>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {versionData.versions.length} saved version
                {versionData.versions.length !== 1 ? 's' : ''} found
              </Text>
              <Badge
                variant="light"
                color="blue"
                leftSection={<IconFileText size={12} />}
              >
                Current: v{currentVersionNumber}
              </Badge>
            </Group>

            <Divider />

            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Version</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>
                    <Group gap="xs">
                      <Badge color="green" variant="filled" size="sm">
                        CURRENT
                      </Badge>
                      <Text fw={600}>v{currentVersionNumber}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <IconClock size={14} />
                      <Text size="sm">Active Version</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      -
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="light"
                        color="green"
                        size="sm"
                        onClick={() => handleDownloadVersion(0)}
                        aria-label="Download current version"
                      >
                        <IconDownload size={14} aria-hidden="true" />
                      </ActionIcon>
                      <ActionIcon
                        variant="light"
                        color="blue"
                        size="sm"
                        onClick={() => handleViewVersion(0)}
                        aria-label="View current version content"
                      >
                        <IconEyeCode size={14} aria-hidden="true" />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
                {sortedVersions.map((version) => (
                  <Table.Tr key={version.version}>
                    <Table.Td>
                      <Text fw={500}>v{version.version}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <IconClock size={14} />
                        <Text size="sm">{formatDate(version.timestamp)}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatSize(version.size)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon
                          variant="light"
                          color="green"
                          size="sm"
                          onClick={() => handleDownloadVersion(version.version)}
                          aria-label={`Download version ${version.version}`}
                        >
                          <IconDownload size={14} aria-hidden="true" />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="orange"
                          size="sm"
                          onClick={() => handleRollback(version.version)}
                          loading={rollbackLoading === version.version}
                          aria-label={`Rollback to version ${version.version}`}
                        >
                          <IconPlayerPlay size={14} aria-hidden="true" />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="blue"
                          size="sm"
                          onClick={() => handleViewVersion(version.version)}
                          loading={loadVersionsOperation.loading}
                          aria-label={`View this version's content`}
                        >
                          <IconEyeCode aria-hidden="true" />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </>
        )}

        <Group justify="flex-end" mt="md">
          <Button onClick={() => modals.close(id)} variant="light">
            Close
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}

VersionManagementModalContent.propTypes = {
  context: PropTypes.object.isRequired,
  id: PropTypes.string.isRequired,
  innerProps: PropTypes.shape({
    analysis: PropTypes.object.isRequired,
    onVersionRollback: PropTypes.func,
  }).isRequired,
};

export default VersionManagementModalContent;
