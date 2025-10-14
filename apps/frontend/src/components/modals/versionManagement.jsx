import { useState, useCallback, lazy } from 'react';
import PropTypes from 'prop-types';
import {
  Modal,
  Stack,
  Text,
  Button,
  Group,
  Table,
  Badge,
  Alert,
  ActionIcon,
  Box,
  Divider,
  LoadingOverlay,
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
  IconGitCompare,
} from '@tabler/icons-react';
import { analysisService } from '../../services/analysisService';
import { useNotifications } from '../../hooks/useNotifications';
import { useModalDataLoader } from '../../hooks/useModalDataLoader';
import logger from '../../utils/logger';
const AnalysisEditModal = lazy(() => import('../modals/codeMirrorCommon'));

export default function VersionManagementModal({
  isOpen,
  onClose,
  analysis,
  onVersionRollback,
}) {
  const [showContentModal, setShowContentModal] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [versionData, setVersionData] = useState({
    versions: [],
    nextVersionNumber: 2,
    currentVersion: 1,
  });
  const [loading, setLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(null);
  const notify = useNotifications();

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await analysisService.getVersions(analysis.name);
      setVersionData(data);
    } catch (error) {
      logger.error('Failed to load versions:', error);
      const errorMessage = error.message || 'Failed to load version history';
      notify.error(errorMessage);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.name]);

  // Load versions when modal opens using existing hook pattern
  useModalDataLoader(isOpen, loadVersions, !!analysis?.name);

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
    try {
      await notify.executeWithNotification(
        analysisService.downloadAnalysis(analysis.name, version),
        {
          loading: `Downloading version ${version} of ${analysis.name}...`,
          success: 'Version downloaded successfully',
        },
      );
    } catch (error) {
      logger.error('Failed to download version:', error);
    }
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

  const currentVersionNumber = versionData.currentVersion;
  const sortedVersions = [...versionData.versions]
    .filter((version) => version.version !== currentVersionNumber)
    .sort((a, b) => b.version - a.version);

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      aria-labelledby="version-management-modal-title"
      title={
        <Group gap="sm">
          <IconHistory size={20} aria-hidden="true" />
          <Text fw={600} id="version-management-modal-title">
            Version History - {analysis?.name}
          </Text>
        </Group>
      }
      size="lg"
      centered
    >
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

        {loading ? (
          <Box pos="relative" h={200}>
            <LoadingOverlay visible />
          </Box>
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
                        onClick={() => {
                          setSelectedVersion(0);
                          setShowContentModal(true);
                        }}
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
                          onClick={() => {
                            setSelectedVersion(version.version);
                            setShowContentModal(true);
                          }}
                          loading={loading}
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
          <Button onClick={onClose} variant="light">
            Close
          </Button>
        </Group>
      </Stack>

      {showContentModal && (
        <AnalysisEditModal
          analysis={analysis}
          onClose={() => {
            setShowContentModal(false);
            setSelectedVersion(null);
          }}
          readOnly={true}
          type="analysis"
          version={selectedVersion}
          showDiffToggle={selectedVersion !== 0} // Only show diff toggle for non-current versions
        />
      )}
    </Modal>
  );
}

VersionManagementModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
  }),
  onVersionRollback: PropTypes.func,
};
