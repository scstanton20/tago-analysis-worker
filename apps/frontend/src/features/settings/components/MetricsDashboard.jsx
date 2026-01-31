import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Grid,
  Text,
  Group,
  Badge,
  Stack,
  Box,
  Table,
  Progress,
  Tabs,
  Card,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconX,
  IconCpu,
  IconDatabase,
  IconClock,
  IconActivity,
  IconNetwork,
  IconBrandSpeedtest,
  IconChartBar,
  IconSum,
  IconContainer,
  IconUsers,
} from '@tabler/icons-react';
import {
  FormAlert,
  LoadingState,
  EmptyState,
  PaperCard,
} from '@/components/global';
import { useBackend, useConnection } from '@/contexts/sseContext';

// Metric Card Component
function MetricCard({
  title,
  value,
  unit,
  icon,
  color = 'blue',
  trend,
  loading = false,
}) {
  const IconComponent = icon;

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between">
        <div>
          <Text c="dimmed" size="sm" tt="uppercase" fw={700}>
            {title}
          </Text>
          <Group align="baseline" gap="xs">
            <Text fw={700} size="xl" c={color}>
              {loading ? '...' : value || '--'}
            </Text>
            {unit && (
              <Text size="sm" c="dimmed">
                {unit}
              </Text>
            )}
          </Group>
          {trend && (
            <Text size="xs" c={trend > 0 ? 'red' : 'green'}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </Text>
          )}
        </div>
        <Box>
          {IconComponent && (
            <IconComponent
              size={24}
              color={`var(--mantine-color-${color}-6)`}
            />
          )}
        </Box>
      </Group>
    </Card>
  );
}

MetricCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  unit: PropTypes.string,
  icon: PropTypes.elementType,
  color: PropTypes.string,
  trend: PropTypes.number,
  loading: PropTypes.bool,
};

// Status Badge Component
function StatusBadge({ isOnline, loading = false }) {
  if (loading) {
    return (
      <Badge color="gray" variant="filled">
        Loading...
      </Badge>
    );
  }

  return (
    <Badge
      color={isOnline ? 'green' : 'red'}
      variant="filled"
      leftSection={isOnline ? <IconCheck size={12} /> : <IconX size={12} />}
    >
      {isOnline ? 'Online' : 'Offline'}
    </Badge>
  );
}

StatusBadge.propTypes = {
  isOnline: PropTypes.bool.isRequired,
  loading: PropTypes.bool,
};

// Process Table Component
function ProcessTable({ processes, loading = false }) {
  if (loading) {
    return <LoadingState loading={true} minHeight={200} />;
  }

  if (!processes || processes.length === 0) {
    return (
      <EmptyState
        title="No Running Processes"
        description="Analysis processes will appear here when running"
        icon={<IconActivity size={48} />}
      />
    );
  }

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Process Name</Table.Th>
          <Table.Th>
            <Group gap={4}>
              Analysis ID
              <Tooltip
                label="The unique identifier of an analysis related to this worker application only. This does not match the analysis ID in Tago.io."
                multiline
                w={250}
              >
                <IconAlertCircle size={14} style={{ cursor: 'help' }} />
              </Tooltip>
            </Group>
          </Table.Th>
          <Table.Th>CPU %</Table.Th>
          <Table.Th>Memory (MB)</Table.Th>
          <Table.Th>Uptime (hrs)</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {processes.map((process, index) => (
          <Table.Tr key={process.analysis_id || index}>
            <Table.Td>
              <Text fw={500}>{process.name || process.analysis_id}</Text>
            </Table.Td>
            <Table.Td>{process.analysis_id}</Table.Td>
            <Table.Td>
              <Group gap="xs">
                <Text>{process.cpu?.toFixed(1) || '0.0'}</Text>
                <Progress
                  value={Math.min(process.cpu || 0, 100)}
                  size="xs"
                  color={
                    process.cpu > 80
                      ? 'red'
                      : process.cpu > 50
                        ? 'orange'
                        : 'blue'
                  }
                  w={50}
                />
              </Group>
            </Table.Td>
            <Table.Td>{process.memory?.toFixed(0) || '0'}</Table.Td>
            <Table.Td>{process.uptime?.toFixed(1) || '0.0'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

ProcessTable.propTypes = {
  processes: PropTypes.arrayOf(
    PropTypes.shape({
      analysis_id: PropTypes.string,
      name: PropTypes.string,
      cpu: PropTypes.number,
      memory: PropTypes.number,
      uptime: PropTypes.number,
    }),
  ),
  loading: PropTypes.bool,
};

// Metrics Tab Content Component for specific tab types
function MetricsTabContent({
  data,
  processes,
  loading,
  formatNumber,
  tabType,
}) {
  const isTotal = tabType === 'total';
  const isContainer = tabType === 'container';
  const isChildren = tabType === 'children';

  return (
    <Stack gap="lg">
      {/* Main Metrics Grid - Reorganized for better visual flow */}
      <Grid>
        {/* Status and Key Process Metrics - Top Row */}
        <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Backend Status"
            value={data.backendUp === 1 ? 'Online' : 'Offline'}
            icon={IconCheck}
            color={data.backendUp === 1 ? 'green' : 'red'}
            loading={loading}
          />
        </Grid.Col>

        {isTotal && (
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
            <MetricCard
              title="Analysis Processes"
              value={formatNumber(data.analysisProcesses, 0)}
              icon={IconUsers}
              color="blue"
              loading={loading}
            />
          </Grid.Col>
        )}

        {isChildren && (
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
            <MetricCard
              title="Running Processes"
              value={formatNumber(data.processCount, 0)}
              icon={IconActivity}
              color="blue"
              loading={loading}
            />
          </Grid.Col>
        )}

        {isContainer && (
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
            <MetricCard
              title="Event Loop Lag"
              value={formatNumber(data.eventLoopLag, 2)}
              unit="ms"
              icon={IconClock}
              color={
                data.eventLoopLag > 10
                  ? 'red'
                  : data.eventLoopLag > 5
                    ? 'orange'
                    : 'green'
              }
              loading={loading}
            />
          </Grid.Col>
        )}

        {(isContainer || isTotal) && (
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
            <MetricCard
              title="HTTP Requests"
              value={formatNumber(data.requestRate, 3)}
              unit="req/s"
              icon={IconBrandSpeedtest}
              color="teal"
              loading={loading}
            />
          </Grid.Col>
        )}

        {/* Performance Metrics - Available space flow */}
        {(isContainer || isTotal) && (
          <>
            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <MetricCard
                title="HTTP Error Rate"
                value={formatNumber(data.errorRate, 2)}
                unit="% (5xx responses)"
                icon={IconAlertCircle}
                color={
                  data.errorRate > 5
                    ? 'red'
                    : data.errorRate > 1
                      ? 'orange'
                      : 'green'
                }
                loading={loading}
              />
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <MetricCard
                title="DNS Cache Hit Rate"
                value={formatNumber(data.dnsHitRate, 1)}
                unit="% (this TTL period)"
                icon={IconNetwork}
                color="cyan"
                loading={loading}
              />
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <MetricCard
                title="HTTP P95 Latency"
                value={formatNumber(data.p95Latency, 3)}
                unit="s"
                icon={IconClock}
                color="indigo"
                loading={loading}
              />
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <MetricCard
                title="HTTP P99 Latency"
                value={formatNumber(data.p99Latency, 3)}
                unit="s"
                icon={IconClock}
                color="violet"
                loading={loading}
              />
            </Grid.Col>
          </>
        )}

        {/* Resource Usage - Larger cards for emphasis */}
        <Grid.Col span={{ base: 12, md: 6, xl: 4 }}>
          <MetricCard
            title={
              isTotal
                ? 'Total Memory'
                : isContainer
                  ? 'Container Memory'
                  : 'Children Memory'
            }
            value={formatNumber(data.memoryUsage, 0)}
            unit="MB"
            icon={IconDatabase}
            color="orange"
            loading={loading}
          />
        </Grid.Col>

        {isTotal ? (
          <>
            <Grid.Col span={{ base: 12, md: 3, xl: 4 }}>
              <MetricCard
                title="Container CPU"
                value={formatNumber(data.containerCPU, 1)}
                unit="%"
                icon={IconCpu}
                color="red"
                loading={loading}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3, xl: 4 }}>
              <MetricCard
                title="Children CPU"
                value={formatNumber(data.childrenCPU, 1)}
                unit="% (sum of all)"
                icon={IconUsers}
                color="blue"
                loading={loading}
              />
            </Grid.Col>
          </>
        ) : (
          <Grid.Col span={{ base: 12, md: 6, xl: 8 }}>
            <MetricCard
              title={isContainer ? 'Container CPU' : 'Children CPU (Sum)'}
              value={formatNumber(data.cpuUsage, 1)}
              unit="%"
              icon={IconCpu}
              color="red"
              loading={loading}
            />
          </Grid.Col>
        )}
      </Grid>

      {/* Process Table - Full width for detailed data */}
      {processes && processes.length > 0 && (
        <PaperCard
          title="Analysis Processes"
          icon={<IconChartBar size={20} />}
          actions={
            <Badge variant="light" color="brand">
              {processes.length} processes
            </Badge>
          }
          shadow="sm"
        >
          <ProcessTable processes={processes} loading={loading} />
        </PaperCard>
      )}
    </Stack>
  );
}

MetricsTabContent.propTypes = {
  data: PropTypes.shape({
    backendUp: PropTypes.number,
    analysisProcesses: PropTypes.number,
    processCount: PropTypes.number,
    eventLoopLag: PropTypes.number,
    requestRate: PropTypes.number,
    errorRate: PropTypes.number,
    dnsHitRate: PropTypes.number,
    p95Latency: PropTypes.number,
    p99Latency: PropTypes.number,
    memoryUsage: PropTypes.number,
    containerCPU: PropTypes.number,
    childrenCPU: PropTypes.number,
    cpuUsage: PropTypes.number,
  }),
  processes: PropTypes.array,
  loading: PropTypes.bool.isRequired,
  formatNumber: PropTypes.func.isRequired,
  tabType: PropTypes.oneOf(['total', 'container', 'children']).isRequired,
};

// Main Metrics Dashboard Component
function MetricsDashboard() {
  const { metricsData } = useBackend();
  const {
    connectionStatus,
    sessionId,
    subscribeToMetrics,
    unsubscribeFromMetrics,
  } = useConnection();
  const [activeTab, setActiveTab] = useState('total');

  // Subscribe to metrics channel when connected (detailed metrics only for Settings)
  useEffect(() => {
    if (connectionStatus !== 'connected' || !sessionId) return;

    subscribeToMetrics();

    return () => {
      unsubscribeFromMetrics();
    };
  }, [connectionStatus, sessionId, subscribeToMetrics, unsubscribeFromMetrics]);

  // Derive loading state from metricsData availability
  const loading = !metricsData;

  // Derive lastUpdate from metricsData timestamp
  const lastUpdate = metricsData ? new Date(metricsData.timestamp) : null;

  const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined) return '--';
    return Number(value).toFixed(decimals);
  };

  const totalData = metricsData?.total || {};
  const containerData = metricsData?.container || {};
  const childrenData = metricsData?.children || {};
  const processes = metricsData?.processes || [];

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between" align="center">
        <div>
          <Text size="lg" fw={600} mb="sm">
            System Metrics
          </Text>
          <Text c="dimmed">
            Real-time monitoring dashboard • Updates every second
          </Text>
        </div>
        <Group gap="xs">
          <StatusBadge
            isOnline={connectionStatus === 'connected'}
            loading={loading}
          />
          {lastUpdate && (
            <Text size="sm" c="dimmed">
              Updated {lastUpdate.toLocaleTimeString()}
            </Text>
          )}
        </Group>
      </Group>

      {/* Connection Status Alert */}
      {connectionStatus !== 'connected' && (
        <FormAlert
          type={connectionStatus === 'connecting' ? 'info' : 'error'}
          title="Connection Status"
          message={
            connectionStatus === 'connecting'
              ? 'Connecting to real-time data stream...'
              : 'Lost connection to real-time data stream. Attempting to reconnect...'
          }
        />
      )}

      {/* Tabbed Metrics View */}
      <Tabs value={activeTab} onChange={setActiveTab} color="brand">
        <Tabs.List>
          <Tabs.Tab value="total" leftSection={<IconSum size={16} />}>
            Total System
          </Tabs.Tab>
          <Tabs.Tab value="container" leftSection={<IconContainer size={16} />}>
            Backend Container
          </Tabs.Tab>
          <Tabs.Tab value="children" leftSection={<IconUsers size={16} />}>
            Analysis Processes
          </Tabs.Tab>
        </Tabs.List>

        <Box mt="md">
          <Tabs.Panel value="total">
            <MetricsTabContent
              data={totalData}
              processes={processes}
              loading={loading}
              formatNumber={formatNumber}
              tabType="total"
            />
          </Tabs.Panel>

          <Tabs.Panel value="container">
            <MetricsTabContent
              data={containerData}
              processes={[]} // Container tab doesn't show analysis processes
              loading={loading}
              formatNumber={formatNumber}
              tabType="container"
            />
          </Tabs.Panel>

          <Tabs.Panel value="children">
            <MetricsTabContent
              data={childrenData}
              processes={processes}
              loading={loading}
              formatNumber={formatNumber}
              tabType="children"
            />
          </Tabs.Panel>
        </Box>
      </Tabs>
    </Stack>
  );
}

MetricsDashboard.propTypes = {};

export default MetricsDashboard;
