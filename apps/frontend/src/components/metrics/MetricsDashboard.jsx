// frontend/src/components/metrics/metricsDashboard.jsx
import { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Title,
  Box,
  Button,
  Alert,
  LoadingOverlay,
  Table,
  Progress,
  Center,
  Tabs,
} from '@mantine/core';
import {
  IconRefresh,
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
import { useSSE } from '../../contexts/sseContext';

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

// Process Table Component
function ProcessTable({ processes, loading = false }) {
  // Helper to convert bytes to Mbps
  const bytesToMbps = (bytes) => {
    if (!bytes || bytes === 0) return 0;
    return (bytes * 8) / 1000000; // Convert to megabits per second
  };

  if (loading) {
    return (
      <Box pos="relative" h={200}>
        <LoadingOverlay visible />
      </Box>
    );
  }

  if (!processes || processes.length === 0) {
    return (
      <Center h={200}>
        <Text c="dimmed">No running processes</Text>
      </Center>
    );
  }

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Process Name</Table.Th>
          <Table.Th>CPU %</Table.Th>
          <Table.Th>Memory (MB)</Table.Th>
          <Table.Th>RX (Mbps)</Table.Th>
          <Table.Th>TX (Mbps)</Table.Th>
          <Table.Th>Uptime (hrs)</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {processes.map((process, index) => (
          <Table.Tr key={process.name || index}>
            <Table.Td>
              <Text fw={500}>{process.name}</Text>
            </Table.Td>
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
            <Table.Td>
              <Text c={bytesToMbps(process.networkRx) > 0 ? 'blue' : 'dimmed'}>
                {bytesToMbps(process.networkRx).toFixed(2)}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text c={bytesToMbps(process.networkTx) > 0 ? 'green' : 'dimmed'}>
                {bytesToMbps(process.networkTx).toFixed(2)}
              </Text>
            </Table.Td>
            <Table.Td>{process.uptime?.toFixed(1) || '0.0'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

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
    <>
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

        <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title={isContainer ? 'HTTP Requests' : 'Request Rate'}
            value={formatNumber(data.requestRate, 3)}
            unit="req/s"
            icon={IconBrandSpeedtest}
            color="teal"
            loading={loading}
          />
        </Grid.Col>

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
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <IconChartBar size={20} />
              <Title order={4}>Analysis Processes</Title>
            </Group>
            <Badge variant="light" color="blue">
              {processes.length} processes
            </Badge>
          </Group>
          <ProcessTable processes={processes} loading={loading} />
        </Card>
      )}
    </>
  );
}

// Main Metrics Dashboard Component
export default function MetricsDashboard() {
  const { metricsData, connectionStatus } = useSSE();
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeTab, setActiveTab] = useState('total');

  // Update loading state and timestamp when metrics data changes
  useEffect(() => {
    if (metricsData) {
      setLoading(false);
      setLastUpdate(new Date(metricsData.timestamp || Date.now()));
    }
  }, [metricsData]);

  const handleRefresh = () => {
    // Refresh is handled automatically by SSE system
    setLastUpdate(new Date());
  };

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
          <Title order={2}>📊 System Metrics</Title>
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
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            size="sm"
            onClick={handleRefresh}
            disabled={connectionStatus !== 'connected'}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {/* Connection Status Alert */}
      {connectionStatus !== 'connected' && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Connection Status"
          color={connectionStatus === 'connecting' ? 'blue' : 'red'}
        >
          {connectionStatus === 'connecting'
            ? 'Connecting to real-time data stream...'
            : 'Lost connection to real-time data stream. Attempting to reconnect...'}
        </Alert>
      )}

      {/* Tabbed Metrics View */}
      <Tabs value={activeTab} onChange={setActiveTab}>
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
            <Stack gap="lg">
              <MetricsTabContent
                data={totalData}
                processes={processes}
                loading={loading}
                formatNumber={formatNumber}
                tabType="total"
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="container">
            <Stack gap="lg">
              <MetricsTabContent
                data={containerData}
                processes={[]} // Container tab doesn't show analysis processes
                loading={loading}
                formatNumber={formatNumber}
                tabType="container"
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="children">
            <Stack gap="lg">
              <MetricsTabContent
                data={childrenData}
                processes={processes}
                loading={loading}
                formatNumber={formatNumber}
                tabType="children"
              />
            </Stack>
          </Tabs.Panel>
        </Box>
      </Tabs>
    </Stack>
  );
}
