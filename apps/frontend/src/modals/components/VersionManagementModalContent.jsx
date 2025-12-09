/**
 * Version Management modal content component
 * Manages viewing and rolling back to previous versions of an analysis
 * @module modals/components/VersionManagementModalContent
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { useAsyncMount, useAsyncOperation } from '../../hooks/async';
import {
  Stack,
  Text,
  Group,
  Table,
  Badge,
  ActionIcon,
  Divider,
  Box,
  Pagination,
  Center,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconDownload,
  IconPlayerPlay,
  IconInfoCircle,
  IconClock,
  IconFileText,
  IconEyeCode,
} from '@tabler/icons-react';
import { analysisService } from '../../services/analysisService';
import { notificationAPI } from '../../utils/notificationAPI.jsx';
import { modalService } from '../modalService';
import { LoadingState, FormAlert } from '../../components/global';
import logger from '../../utils/logger';
import PropTypes from 'prop-types';

const VERSIONS_PER_PAGE = 10;

/**
 * VersionManagementModalContent
 * Content component for version management modal
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Modal ID
 * @param {Object} props.innerProps - Modal inner props
 * @param {Object} props.innerProps.analysis - Analysis object
 * @param {Function} props.innerProps.onVersionRollback - Callback after version rollback
 * @returns {JSX.Element} Modal content
 */
function VersionManagementModalContent({ innerProps }) {
  const { analysis, onVersionRollback } = innerProps;
  const [versionData, setVersionData] = useState({
    versions: [],
    nextVersionNumber: 2,
    currentVersion: 1,
    totalCount: 0,
    totalPages: 0,
    page: 1,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(null);
  const downloadOperation = useAsyncOperation();

  // Cache for page data to avoid re-fetching visited pages
  const pageCache = useRef(new Map());

  // Clear cache (used after rollback when data changes)
  const clearCache = useCallback(() => {
    pageCache.current.clear();
  }, []);

  // Load versions for a specific page (with caching)
  const loadVersions = useCallback(
    async (page = 1, skipCache = false) => {
      if (!analysis?.id) return;

      // Check cache first
      if (!skipCache && pageCache.current.has(page)) {
        const cachedData = pageCache.current.get(page);
        setVersionData(cachedData);
        setCurrentPage(page);
        return;
      }

      // Fetch from API
      const data = await analysisService.getVersions(analysis.id, {
        page,
        limit: VERSIONS_PER_PAGE,
      });

      // Store in cache
      pageCache.current.set(page, data);

      setVersionData(data);
      setCurrentPage(page);
    },
    [analysis?.id],
  );

  // Load initial versions when component mounts or analysis changes
  // Cache is cleared on mount (when deps change) and on unmount (via onCleanup)
  const loadVersionsOperation = useAsyncMount(
    async () => {
      clearCache();
      await loadVersions(1);
    },
    { deps: [analysis?.id], onCleanup: clearCache },
  );

  // Handle page change
  const handlePageChange = async (page) => {
    // If page is cached, update instantly without loading state
    if (pageCache.current.has(page)) {
      await loadVersions(page);
      return;
    }

    // Otherwise show loading state while fetching
    setIsPageLoading(true);
    try {
      await loadVersions(page);
    } catch (error) {
      logger.error('Failed to load versions page:', error);
    } finally {
      setIsPageLoading(false);
    }
  };

  const handleRollback = async (version) => {
    modals.openConfirmModal({
      title: 'Rollback to Previous Version',
      children: `Are you sure you want to rollback "${analysis.name}" to version ${version}? This will clear the current logs and restart the analysis if it's running.`,
      labels: { confirm: 'Rollback', cancel: 'Cancel' },
      confirmProps: { color: 'orange' },
      onConfirm: async () => {
        setRollbackLoading(version);
        try {
          await notificationAPI.executeWithNotification(
            analysisService.rollbackToVersion(analysis.id, version),
            {
              loading: `Rolling back ${analysis.name} to version ${version}...`,
              success: `Successfully rolled back to version ${version}`,
            },
          );

          if (onVersionRollback) {
            onVersionRollback(version);
          }

          // Clear cache and reload versions to update current version indicator
          clearCache();
          await loadVersions(currentPage, true);
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
      await notificationAPI.executeWithNotification(
        analysisService.downloadAnalysis(analysis.id, analysis.name, version),
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

  // Filter out the current version from paginated results (already sorted by backend)
  const displayVersions = useMemo(
    () =>
      versionData.versions.filter(
        (version) => version.version !== currentVersionNumber,
      ),
    [versionData.versions, currentVersionNumber],
  );

  const isLoading = loadVersionsOperation.loading || isPageLoading;

  return (
    <Box pos="relative">
      <Stack gap="md">
        <FormAlert
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
        </FormAlert>

        {loadVersionsOperation.loading ? (
          <LoadingState
            loading={true}
            skeleton
            pattern="table"
            skeletonCount={5}
          />
        ) : versionData.totalCount === 0 ? (
          <FormAlert
            icon={<IconInfoCircle size={16} />}
            title="No Version History"
            color="yellow"
            variant="light"
          >
            <Text size="sm">
              No previous versions found. Versions will be created automatically
              when you make changes to the analysis.
            </Text>
          </FormAlert>
        ) : (
          <>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {versionData.totalCount} saved version
                {versionData.totalCount !== 1 ? 's' : ''} found
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

            {isPageLoading ? (
              <LoadingState
                loading={true}
                skeleton
                pattern="table"
                skeletonCount={VERSIONS_PER_PAGE}
                style={{ minHeight: 480 }}
              />
            ) : (
              <Box style={{ minHeight: 480 }}>
                <Table highlightOnHover verticalSpacing="sm" layout="fixed">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={160}>Version</Table.Th>
                      <Table.Th w={280}>Created</Table.Th>
                      <Table.Th w={150}>Size</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {currentPage === 1 && (
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
                    )}
                    {displayVersions.map((version) => (
                      <Table.Tr key={version.version}>
                        <Table.Td>
                          <Text fw={500}>v{version.version}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <IconClock size={14} />
                            <Text size="sm">
                              {formatDate(version.timestamp)}
                            </Text>
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
                              onClick={() =>
                                handleDownloadVersion(version.version)
                              }
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
                              loading={isLoading}
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
              </Box>
            )}

            {versionData.totalPages > 1 && (
              <Center mt="md">
                <Pagination
                  value={currentPage}
                  onChange={handlePageChange}
                  total={versionData.totalPages}
                  disabled={isLoading}
                  withEdges
                  color="brand"
                />
              </Center>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
}

VersionManagementModalContent.propTypes = {
  id: PropTypes.string.isRequired,
  innerProps: PropTypes.shape({
    analysis: PropTypes.object.isRequired,
    onVersionRollback: PropTypes.func,
  }).isRequired,
};

export default VersionManagementModalContent;
