import { useState, useEffect } from 'react';
import { useInitialValues } from '../../../hooks/useInitialState';
import {
  Stack,
  Paper,
  Text,
  Switch,
  NumberInput,
  Group,
  SimpleGrid,
  Badge,
  Loader,
  Card,
  ScrollArea,
  ActionIcon,
  Tooltip,
  Divider,
  Progress,
} from '@mantine/core';
import {
  FormAlert,
  PaperCard,
  SuccessButton,
  UtilityButton,
  DangerButton,
} from '../../../components/global';
import { useNotifications } from '../../../hooks/useNotifications';
import { useAsyncOperation } from '../../../hooks/async/useAsyncOperation';
import {
  IconTransfer,
  IconTrash,
  IconRefresh,
  IconChartBar,
  IconClearAll,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import { dnsService } from '../../../services/dnsService';
import { useBackend } from '../../../contexts/sseContext';
import { useAuth } from '../../../hooks/useAuth';

function DNSCacheSettings() {
  const { dnsCache } = useBackend();
  const { isAuthenticated } = useAuth();
  const notify = useNotifications();
  const loadConfigOperation = useAsyncOperation();
  const loadEntriesOperation = useAsyncOperation();
  const [entries, setEntries] = useState([]);
  const [showEntries, setShowEntries] = useState(false);

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

  useEffect(() => {
    if (isAuthenticated) {
      loadConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Initialize pending values when config is first loaded
  useInitialValues(
    {
      ttl: { setter: setPendingTtl, value: config?.ttl },
      maxEntries: { setter: setPendingMaxEntries, value: config?.maxEntries },
    },
    config && pendingTtl === null && pendingMaxEntries === null,
  );

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

  const loadConfig = async () => {
    await loadConfigOperation.execute(async () => {
      const data = await dnsService.getConfig();

      // Set initial data for immediate display (SSE will update later)
      setInitialConfig(data.config);
      setInitialStats(data.stats);

      // Initialize pending values from loaded config
      setPendingTtl(data.config.ttl);
      setPendingMaxEntries(data.config.maxEntries);
      setHasUnsavedChanges(false);
      setValidationErrors({});
    });
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
      // SSE will update the config automatically

      notify.success(`DNS cache ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      notify.error(
        error.response?.data?.error || 'Failed to update configuration',
      );
    }
  };

  // Manual save for TTL and max entries
  const handleSaveConfig = async () => {
    // Validate all fields
    const ttlError = validateTtl(pendingTtl);
    const maxEntriesError = validateMaxEntries(pendingMaxEntries);

    if (ttlError || maxEntriesError) {
      setValidationErrors({ ttl: ttlError, maxEntries: maxEntriesError });
      notify.error('Please fix validation errors before saving');
      return;
    }

    try {
      await dnsService.updateConfig({
        ttl: pendingTtl,
        maxEntries: pendingMaxEntries,
      });
      // SSE will update the config automatically

      setHasUnsavedChanges(false);
      setValidationErrors({});

      notify.success('DNS cache configuration saved');
    } catch (error) {
      notify.error(
        error.response?.data?.error || 'Failed to save configuration',
      );
    }
  };

  const handleClearCache = async () => {
    try {
      const data = await dnsService.clearCache();
      // SSE will update the stats automatically
      setEntries([]);
      notify.success(`Cleared ${data.entriesCleared} cache entries`);
    } catch {
      notify.error('Failed to clear DNS cache');
    }
  };

  const handleResetStats = async () => {
    try {
      await dnsService.resetStats();
      // SSE will update the stats automatically
      notify.success('DNS cache statistics reset');
    } catch {
      notify.error('Failed to reset statistics');
    }
  };

  const handleDeleteEntry = async (key) => {
    try {
      await dnsService.deleteCacheEntry(key);
      notify.success('Cache entry deleted');
      // Reload entries to reflect the change
      loadEntries();
      // Stats will be updated via SSE
    } catch {
      notify.error('Failed to delete cache entry');
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

  if (!isAuthenticated) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
        <Text size="sm" c="dimmed">
          Authenticating...
        </Text>
      </Stack>
    );
  }

  if (loadConfigOperation.loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
        <Text size="sm" c="dimmed">
          Loading DNS cache configuration...
        </Text>
      </Stack>
    );
  }

  if (!config) {
    return (
      <FormAlert
        type="error"
        message="Failed to load DNS cache configuration. Please try refreshing the page."
      />
    );
  }

  return (
    <Stack gap="md">
      <Text size="lg" fw={600} mb="sm">
        DNS Cache Configuration
      </Text>

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
                pendingTtl && <Text size="xs">{formatTTL(pendingTtl)}</Text>
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
                  color="blue"
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

          {showEntries && (
            <>
              <Divider />
              {loadEntriesOperation.loading ? (
                <Stack align="center" py="md">
                  <Loader size="sm" />
                </Stack>
              ) : entries.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  No cache entries
                </Text>
              ) : (
                <ScrollArea h={300}>
                  <Stack gap="xs">
                    {entries.map((entry) => (
                      <Paper key={entry.key} p="xs" withBorder>
                        <Group justify="space-between">
                          <Stack gap={4}>
                            <Group gap="xs">
                              <Badge size="sm" variant="light">
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
                              // Handle different DNS cache data structures
                              let addressDisplay = null;

                              if (entry.data?.address) {
                                if (typeof entry.data.address === 'string') {
                                  // Single string address
                                  addressDisplay = entry.data.address;
                                } else if (Array.isArray(entry.data.address)) {
                                  // Array of address objects
                                  const addresses = entry.data.address
                                    .map((addr) => addr.address || addr)
                                    .filter((addr) => typeof addr === 'string');
                                  addressDisplay = addresses.join(', ');
                                }
                              } else if (
                                entry.data?.addresses &&
                                Array.isArray(entry.data.addresses)
                              ) {
                                // Array of string addresses
                                addressDisplay =
                                  entry.data.addresses.join(', ');
                              }

                              return addressDisplay ? (
                                <Text size="xs" c="dimmed">
                                  Address: {addressDisplay}
                                </Text>
                              ) : null;
                            })()}
                          </Stack>
                          <Tooltip label="Delete entry">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={() => handleDeleteEntry(entry.key)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </ScrollArea>
              )}
            </>
          )}
        </Stack>
      </PaperCard>
    </Stack>
  );
}

DNSCacheSettings.propTypes = {};

export default DNSCacheSettings;
