import { useState } from 'react';
import {
  Stack,
  Paper,
  Text,
  Switch,
  NumberInput,
  Group,
  SimpleGrid,
  Badge,
  Card,
  ActionIcon,
  Tooltip,
  Divider,
  Progress,
  Tabs,
  Select,
  Box,
} from '@mantine/core';
import {
  FormAlert,
  PaperCard,
  SuccessButton,
  UtilityButton,
  DangerButton,
  LoadingState,
  EmptyState,
} from '../../../components/global';
import { notificationAPI } from '../../../utils/notificationAPI.jsx';
import { useAsyncOperation, useAsyncEffect } from '../../../hooks/async';
import {
  IconTransfer,
  IconTrash,
  IconRefresh,
  IconChartBar,
  IconClearAll,
  IconDeviceFloppy,
  IconWorld,
  IconCode,
} from '@tabler/icons-react';
import { dnsService } from '../../../services/dnsService';
import { useBackend, useAnalyses } from '../../../contexts/sseContext';
import { useAuth } from '../../../hooks/useAuth';
import PropTypes from 'prop-types';

/**
 * DNS Cache Settings Component with Overall and By Analysis tabs
 */
function DNSCacheSettings({ focusAnalysisId }) {
  const { dnsCache } = useBackend();
  const { analyses } = useAnalyses();
  const { isAuthenticated } = useAuth();
  const loadEntriesOperation = useAsyncOperation();
  const [entries, setEntries] = useState([]);
  const [showEntries, setShowEntries] = useState(true);

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState(
    focusAnalysisId ? 'by-analysis' : 'overall',
  );

  // Per-analysis state
  const [allAnalysisStats, setAllAnalysisStats] = useState({});
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(
    focusAnalysisId || null,
  );
  const [analysisEntries, setAnalysisEntries] = useState([]);

  // Manual save state for TTL and maxEntries
  const [pendingTtl, setPendingTtl] = useState(null);
  const [pendingMaxEntries, setPendingMaxEntries] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Local state for initial load (before SSE takes over)
  const [initialConfig, setInitialConfig] = useState(null);
  const [initialStats, setInitialStats] = useState(null);

  // Use SSE data directly like other components, with local state as fallback only for initial load
  const config = dnsCache?.config || initialConfig;
  const stats = dnsCache?.stats || initialStats;

  // Load config on mount when authenticated
  const loadConfigOperation = useAsyncEffect(async () => {
    const data = await dnsService.getConfig();

    // Set initial data for immediate display (SSE will update later)
    setInitialConfig(data.config);
    setInitialStats(data.stats);

    // Initialize pending values from loaded config
    setPendingTtl(data.config.ttl);
    setPendingMaxEntries(data.config.maxEntries);
    setHasUnsavedChanges(false);
    setValidationErrors({});
  }, [isAuthenticated]);

  // Load cache entries on mount since showEntries defaults to true
  useAsyncEffect(async () => {
    const entriesData = await dnsService.getCacheEntries();
    setEntries(entriesData.entries);
  }, [isAuthenticated]);

  // Load all analysis stats
  const loadAllAnalysisStats = useAsyncEffect(async () => {
    const data = await dnsService.getAllAnalysisStats();
    setAllAnalysisStats(data.analysisStats || {});
  }, [isAuthenticated]);

  // Effective selected analysis - defaults to first option if none selected
  const effectiveSelectedId =
    selectedAnalysisId || Object.keys(allAnalysisStats)[0] || null;

  // Load analysis-specific entries when selected
  const loadAnalysisEntriesOperation = useAsyncEffect(async () => {
    if (effectiveSelectedId && activeSubTab === 'by-analysis') {
      const data =
        await dnsService.getAnalysisCacheEntries(effectiveSelectedId);
      setAnalysisEntries(data.entries || []);
    }
  }, [effectiveSelectedId, activeSubTab]);

  // Build analysis options for the select dropdown (React 19 compiler auto-memoizes)
  const analysisOptions = Object.keys(allAnalysisStats)
    .map((analysisId) => ({
      value: analysisId,
      label: analyses[analysisId]?.name || analysisId,
      stats: allAnalysisStats[analysisId],
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Validation functions
  const validateTtl = (value) => {
    if (value < 1000) return 'TTL must be at least 1000ms (1 second)';
    if (value > 86400000) return 'TTL must not exceed 86400000ms (24 hours)';
    return null;
  };

  const validateMaxEntries = (value) => {
    if (value < 10) return 'Max entries must be at least 10';
    if (value > 10000) return 'Max entries must not exceed 10000';
    return null;
  };

  // Handle manual input changes
  const handleTtlChange = (value) => {
    setPendingTtl(value);
    setHasUnsavedChanges(
      value !== config?.ttl || pendingMaxEntries !== config?.maxEntries,
    );

    const error = validateTtl(value);
    setValidationErrors((prev) => ({ ...prev, ttl: error }));
  };

  const handleMaxEntriesChange = (value) => {
    setPendingMaxEntries(value);
    setHasUnsavedChanges(
      pendingTtl !== config?.ttl || value !== config?.maxEntries,
    );

    const error = validateMaxEntries(value);
    setValidationErrors((prev) => ({ ...prev, maxEntries: error }));
  };

  const loadEntries = async () => {
    await loadEntriesOperation.execute(async () => {
      const data = await dnsService.getCacheEntries();
      setEntries(data.entries);
    });
  };

  // Handle enabled/disabled switch
  const handleEnabledToggle = async (enabled) => {
    try {
      await dnsService.updateConfig({ enabled });
      notificationAPI.success(`DNS cache ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      notificationAPI.error(
        error.response?.data?.error || 'Failed to update configuration',
      );
    }
  };

  // Manual save for TTL and max entries
  const handleSaveConfig = async () => {
    const ttlError = validateTtl(pendingTtl);
    const maxEntriesError = validateMaxEntries(pendingMaxEntries);

    if (ttlError || maxEntriesError) {
      setValidationErrors({ ttl: ttlError, maxEntries: maxEntriesError });
      notificationAPI.error('Please fix validation errors before saving');
      return;
    }

    try {
      await dnsService.updateConfig({
        ttl: pendingTtl,
        maxEntries: pendingMaxEntries,
      });

      setHasUnsavedChanges(false);
      setValidationErrors({});

      notificationAPI.success('DNS cache configuration saved');
    } catch (error) {
      notificationAPI.error(
        error.response?.data?.error || 'Failed to save configuration',
      );
    }
  };

  const handleClearCache = async () => {
    try {
      const data = await dnsService.clearCache();
      setEntries([]);
      notificationAPI.success(`Cleared ${data.entriesCleared} cache entries`);
    } catch {
      notificationAPI.error('Failed to clear DNS cache');
    }
  };

  const handleResetStats = async () => {
    try {
      await dnsService.resetStats();
      // Reload analysis stats after reset
      const data = await dnsService.getAllAnalysisStats();
      setAllAnalysisStats(data.analysisStats || {});
      notificationAPI.success('DNS cache statistics reset');
    } catch {
      notificationAPI.error('Failed to reset statistics');
    }
  };

  const handleDeleteEntry = async (key) => {
    try {
      await dnsService.deleteCacheEntry(key);
      notificationAPI.success('Cache entry deleted');
      loadEntries();
    } catch {
      notificationAPI.error('Failed to delete cache entry');
    }
  };

  const formatTTL = (ms) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  // Combined loading state check
  const isLoading = !isAuthenticated || loadConfigOperation.loading;

  // Get selected analysis stats
  const selectedAnalysisStats = effectiveSelectedId
    ? allAnalysisStats[effectiveSelectedId]
    : null;

  // Render cache entry
  const renderCacheEntry = (entry, onDelete) => (
    <Paper key={entry.key} p="xs" withBorder>
      <Group justify="space-between">
        <Stack gap={4}>
          <Group gap="xs">
            <Badge size="sm" color="brand">
              {entry.key.split(':')[0]}
            </Badge>
            <Text size="sm" fw={500}>
              {entry.key.includes(':')
                ? entry.key.split(':').slice(1).join(':')
                : entry.key}
            </Text>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              TTL: {formatTTL(entry.remainingTTL)}
            </Text>
            <Text size="xs" c="dimmed">
              Age: {formatTTL(entry.age)}
            </Text>
            {entry.expired && (
              <Badge size="xs" color="red">
                Expired
              </Badge>
            )}
          </Group>
          {(() => {
            let addressDisplay = null;

            if (entry.data?.address) {
              if (typeof entry.data.address === 'string') {
                addressDisplay = entry.data.address;
              } else if (Array.isArray(entry.data.address)) {
                const addresses = entry.data.address
                  .map((addr) => addr.address || addr)
                  .filter((addr) => typeof addr === 'string');
                addressDisplay = addresses.join(', ');
              }
            } else if (
              entry.data?.addresses &&
              Array.isArray(entry.data.addresses)
            ) {
              addressDisplay = entry.data.addresses.join(', ');
            }

            return addressDisplay ? (
              <Text size="xs" c="dimmed">
                Address: {addressDisplay}
              </Text>
            ) : null;
          })()}
        </Stack>
        {onDelete && (
          <Tooltip label="Delete entry">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() => onDelete(entry.key)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Paper>
  );

  return (
    <LoadingState
      loading={isLoading}
      skeleton
      pattern="content"
      skeletonCount={4}
    >
      {loadConfigOperation.error || (!config && !isLoading) ? (
        <FormAlert
          type="error"
          message="Failed to load DNS cache configuration. Please try refreshing the page."
        />
      ) : config ? (
        <Stack gap="md">
          <Text size="lg" fw={600} mb="sm">
            DNS Cache Configuration
          </Text>

          <Tabs value={activeSubTab} onChange={setActiveSubTab} color="brand">
            <Tabs.List mb="md">
              <Tabs.Tab value="overall" leftSection={<IconWorld size={16} />}>
                Overall
              </Tabs.Tab>
              <Tabs.Tab
                value="by-analysis"
                leftSection={<IconCode size={16} />}
              >
                By Analysis
              </Tabs.Tab>
            </Tabs.List>

            {/* Overall Tab */}
            <Tabs.Panel value="overall">
              <Stack gap="md">
                {/* Configuration */}
                <PaperCard
                  title="DNS Cache Settings"
                  icon={<IconTransfer size={20} />}
                  actions={
                    <Switch
                      checked={config.enabled}
                      onChange={(event) =>
                        handleEnabledToggle(event.currentTarget.checked)
                      }
                      label={config.enabled ? 'Enabled' : 'Disabled'}
                    />
                  }
                >
                  <Stack gap="md">
                    <SimpleGrid cols={2} spacing="md">
                      <NumberInput
                        label="TTL (milliseconds)"
                        description="How long to cache DNS results"
                        value={pendingTtl}
                        onChange={handleTtlChange}
                        min={1000}
                        max={86400000}
                        step={1000}
                        disabled={!config.enabled}
                        error={validationErrors.ttl}
                        rightSection={
                          pendingTtl && (
                            <Text size="xs">{formatTTL(pendingTtl)}</Text>
                          )
                        }
                      />
                      <NumberInput
                        label="Max Entries"
                        description="Maximum number of cached entries"
                        value={pendingMaxEntries}
                        onChange={handleMaxEntriesChange}
                        min={10}
                        max={10000}
                        step={10}
                        disabled={!config.enabled}
                        error={validationErrors.maxEntries}
                      />
                    </SimpleGrid>

                    {hasUnsavedChanges && (
                      <Group justify="center">
                        <SuccessButton
                          leftSection={<IconDeviceFloppy size={16} />}
                          onClick={handleSaveConfig}
                          disabled={
                            !config.enabled ||
                            validationErrors.ttl ||
                            validationErrors.maxEntries
                          }
                        >
                          Save Configuration
                        </SuccessButton>
                      </Group>
                    )}
                  </Stack>
                </PaperCard>

                {/* Statistics */}
                <PaperCard
                  title="Cache Statistics"
                  icon={<IconChartBar size={20} />}
                  actions={
                    <UtilityButton
                      size="xs"
                      leftSection={<IconRefresh size={14} />}
                      onClick={handleResetStats}
                    >
                      Reset Stats
                    </UtilityButton>
                  }
                >
                  <Stack gap="md">
                    <SimpleGrid cols={3} spacing="sm">
                      <Card p="xs" withBorder>
                        <Text size="xs" c="dimmed">
                          Cache Size
                        </Text>
                        <Text size="lg" fw={600}>
                          {stats?.cacheSize || 0}
                        </Text>
                      </Card>
                      <Card p="xs" withBorder>
                        <Text size="xs" c="dimmed">
                          Hit Rate (this TTL)
                        </Text>
                        <Text size="lg" fw={600}>
                          {stats?.hitRate || 0}%
                        </Text>
                      </Card>
                      <Card p="xs" withBorder>
                        <Text size="xs" c="dimmed">
                          Hits / Misses (this TTL)
                        </Text>
                        <Text size="lg" fw={600}>
                          {stats?.hits || 0} / {stats?.misses || 0}
                        </Text>
                      </Card>
                      <Card p="xs" withBorder>
                        <Text size="xs" c="dimmed">
                          TTL Period Progress
                        </Text>
                        <Stack gap={4}>
                          <Progress
                            value={Math.min(
                              parseFloat(stats?.ttlPeriodProgress || 0),
                              100,
                            )}
                            size="sm"
                            color="brand"
                          />
                          <Text size="sm" fw={600}>
                            {formatTTL(stats?.ttlPeriodRemaining || 0)} left
                          </Text>
                        </Stack>
                      </Card>
                      <Card p="xs" withBorder>
                        <Text size="xs" c="dimmed">
                          Errors
                        </Text>
                        <Text size="lg" fw={600}>
                          {stats?.errors || 0}
                        </Text>
                      </Card>
                      <Card p="xs" withBorder>
                        <Text size="xs" c="dimmed">
                          Evictions
                        </Text>
                        <Text size="lg" fw={600}>
                          {stats?.evictions || 0}
                        </Text>
                      </Card>
                    </SimpleGrid>
                  </Stack>
                </PaperCard>

                {/* Cache Management */}
                <PaperCard
                  title="Cache Management"
                  actions={
                    <DangerButton
                      size="xs"
                      leftSection={<IconClearAll size={14} />}
                      onClick={handleClearCache}
                    >
                      Clear Cache
                    </DangerButton>
                  }
                >
                  <Stack gap="md">
                    {showEntries && (
                      <>
                        {loadEntriesOperation.loading ? (
                          <LoadingState
                            loading={true}
                            skeleton
                            pattern="card"
                            skeletonCount={3}
                          />
                        ) : entries.length === 0 ? (
                          <Text size="sm" c="dimmed" ta="center" py="md">
                            No cache entries
                          </Text>
                        ) : (
                          <Stack gap="xs">
                            {entries.map((entry) =>
                              renderCacheEntry(entry, handleDeleteEntry),
                            )}
                          </Stack>
                        )}
                        <Divider />
                      </>
                    )}

                    <UtilityButton
                      onClick={() => {
                        setShowEntries(!showEntries);
                        if (!showEntries && entries.length === 0) {
                          loadEntries();
                        }
                      }}
                    >
                      {showEntries ? 'Hide' : 'Show'} Cache Entries (
                      {stats?.cacheSize || 0})
                    </UtilityButton>
                  </Stack>
                </PaperCard>
              </Stack>
            </Tabs.Panel>

            {/* By Analysis Tab */}
            <Tabs.Panel value="by-analysis">
              <Stack gap="md">
                {loadAllAnalysisStats.loading ? (
                  <LoadingState
                    loading={true}
                    skeleton
                    pattern="content"
                    skeletonCount={4}
                  />
                ) : Object.keys(allAnalysisStats).length === 0 ? (
                  <EmptyState
                    icon={<IconCode size={48} />}
                    title="No DNS Activity"
                    description="No analyses have made DNS requests yet. DNS statistics will appear here after analyses make network requests."
                  />
                ) : (
                  <>
                    {/* Analysis Selector */}
                    <PaperCard
                      title="Select Analysis"
                      icon={<IconCode size={20} />}
                    >
                      <Select
                        placeholder="Select an analysis to view DNS stats"
                        data={analysisOptions.map((opt) => ({
                          value: opt.value,
                          label: `${opt.label} (${opt.stats.hits + opt.stats.misses} requests)`,
                        }))}
                        value={effectiveSelectedId}
                        onChange={setSelectedAnalysisId}
                        searchable
                      />
                    </PaperCard>

                    {/* Selected Analysis Stats */}
                    {effectiveSelectedId && selectedAnalysisStats && (
                      <>
                        <PaperCard
                          title={`DNS Statistics: ${analyses[effectiveSelectedId]?.name || effectiveSelectedId}`}
                          icon={<IconChartBar size={20} />}
                        >
                          <Stack gap="md">
                            <SimpleGrid cols={3} spacing="sm">
                              <Card p="xs" withBorder>
                                <Text size="xs" c="dimmed">
                                  Hit Rate
                                </Text>
                                <Text size="lg" fw={600}>
                                  {selectedAnalysisStats.hitRate || 0}%
                                </Text>
                              </Card>
                              <Card p="xs" withBorder>
                                <Text size="xs" c="dimmed">
                                  Hits / Misses
                                </Text>
                                <Text size="lg" fw={600}>
                                  {selectedAnalysisStats.hits || 0} /{' '}
                                  {selectedAnalysisStats.misses || 0}
                                </Text>
                              </Card>
                              <Card p="xs" withBorder>
                                <Text size="xs" c="dimmed">
                                  Errors
                                </Text>
                                <Text size="lg" fw={600}>
                                  {selectedAnalysisStats.errors || 0}
                                </Text>
                              </Card>
                              <Card p="xs" withBorder>
                                <Text size="xs" c="dimmed">
                                  Unique Hostnames
                                </Text>
                                <Text size="lg" fw={600}>
                                  {selectedAnalysisStats.hostnameCount || 0}
                                </Text>
                              </Card>
                              <Card p="xs" withBorder>
                                <Text size="xs" c="dimmed">
                                  Cache Entries Used
                                </Text>
                                <Text size="lg" fw={600}>
                                  {selectedAnalysisStats.cacheKeyCount || 0}
                                </Text>
                              </Card>
                            </SimpleGrid>

                            {/* Hostnames List */}
                            {selectedAnalysisStats.hostnames?.length > 0 && (
                              <>
                                <Divider />
                                <Box>
                                  <Text size="sm" fw={600} mb="xs">
                                    Resolved Hostnames
                                  </Text>
                                  <Group gap="xs">
                                    {selectedAnalysisStats.hostnames.map(
                                      (hostname) => (
                                        <Badge
                                          key={hostname}
                                          color="brand"
                                          size="sm"
                                        >
                                          {hostname}
                                        </Badge>
                                      ),
                                    )}
                                  </Group>
                                </Box>
                              </>
                            )}
                          </Stack>
                        </PaperCard>

                        {/* Analysis Cache Entries */}
                        <PaperCard
                          title="Cache Entries Used by This Analysis"
                          icon={<IconTransfer size={20} />}
                        >
                          {loadAnalysisEntriesOperation.loading ? (
                            <LoadingState
                              loading={true}
                              skeleton
                              pattern="card"
                              skeletonCount={3}
                            />
                          ) : analysisEntries.length === 0 ? (
                            <Text size="sm" c="dimmed" ta="center" py="md">
                              No active cache entries for this analysis
                            </Text>
                          ) : (
                            <Stack gap="xs">
                              {analysisEntries.map((entry) =>
                                renderCacheEntry(entry, null),
                              )}
                            </Stack>
                          )}
                        </PaperCard>
                      </>
                    )}
                  </>
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      ) : null}
    </LoadingState>
  );
}

DNSCacheSettings.propTypes = {
  focusAnalysisId: PropTypes.string,
};

export default DNSCacheSettings;
