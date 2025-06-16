// frontend/src/components/connectionStatus.jsx
import { useState, useContext } from 'react';
import { WebSocketContext } from '../contexts/websocketContext';
import {
  ActionIcon,
  Popover,
  Stack,
  Group,
  Text,
  Button,
  Divider,
  LoadingOverlay,
  Box,
  Indicator,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
} from '@tabler/icons-react';

const ConnectionStatus = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { connectionStatus, backendStatus, requestStatusUpdate } =
    useContext(WebSocketContext);

  const getOverallStatusColor = () => {
    if (!backendStatus) return 'red';

    let disconnectedCount = 0;

    if (backendStatus.container_health.status !== 'healthy')
      disconnectedCount++;
    if (connectionStatus !== 'connected') disconnectedCount++;
    if (backendStatus.tagoConnection.runningAnalyses === 0) {
      disconnectedCount++;
    }

    if (disconnectedCount === 3) return 'red';
    return 'green';
  };

  const getStatusText = () => {
    if (!backendStatus) return 'Loading...';
    if (connectionStatus !== 'connected') return 'Disconnected from Server';
    if (backendStatus.container_health.status !== 'healthy')
      return 'Partially Disconnected';
    if (backendStatus.tagoConnection.runningAnalyses === 0) {
      return 'No Running Analyses';
    }
    return 'Connected';
  };

  const handleRetryConnection = () => {
    requestStatusUpdate();
  };

  if (!backendStatus && connectionStatus === 'connecting') {
    return null;
  }

  const isDisconnected =
    connectionStatus !== 'connected' ||
    (backendStatus &&
      (backendStatus.container_health.status !== 'healthy' ||
        backendStatus.tagoConnection.runningAnalyses === 0));

  const isConnecting = connectionStatus === 'connecting';

  return (
    <>
      <LoadingOverlay
        visible={isConnecting}
        zIndex={1000}
        overlayProps={{ blur: 0.5 }}
        loaderProps={{ size: 'lg' }}
        pos="fixed"
      >
        <Stack align="center">
          <Text size="lg" fw={500}>
            Connecting to server...
          </Text>
        </Stack>
      </LoadingOverlay>

      <Popover
        opened={isExpanded}
        onChange={setIsExpanded}
        width={300}
        position="bottom-end"
        withArrow
        shadow="md"
      >
        <Popover.Target>
          <ActionIcon
            variant="subtle"
            onClick={() => setIsExpanded(!isExpanded)}
            size="lg"
          >
            <Group gap="xs">
              <Indicator color={getOverallStatusColor()} size={12} processing>
                <Box />
              </Indicator>
              {isExpanded ? (
                <IconChevronUp size={16} />
              ) : (
                <IconChevronDown size={16} />
              )}
            </Group>
          </ActionIcon>
        </Popover.Target>

        <Popover.Dropdown>
          <Stack>
            <Text fw={500} size="md">
              System Status
            </Text>

            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm">Backend:</Text>
                <Group gap="xs">
                  <Indicator
                    color={
                      backendStatus &&
                      backendStatus.container_health.status === 'healthy'
                        ? 'green'
                        : 'red'
                    }
                    size={8}
                  >
                    <Box />
                  </Indicator>
                  <Text size="sm" tt="capitalize">
                    {backendStatus?.container_health.status || 'unknown'}
                  </Text>
                </Group>
              </Group>

              <Group justify="space-between">
                <Text size="sm">WebSocket:</Text>
                <Group gap="xs">
                  <Indicator
                    color={connectionStatus === 'connected' ? 'green' : 'red'}
                    size={8}
                  >
                    <Box />
                  </Indicator>
                  <Text size="sm" tt="capitalize">
                    {connectionStatus}
                  </Text>
                </Group>
              </Group>

              <Group justify="space-between">
                <Text size="sm">Tago Analyses:</Text>
                <Group gap="xs">
                  <Indicator
                    color={
                      backendStatus &&
                      backendStatus.tagoConnection.runningAnalyses > 0
                        ? 'green'
                        : 'yellow'
                    }
                    size={8}
                  >
                    <Box />
                  </Indicator>
                  <Text size="sm">
                    {backendStatus?.tagoConnection.runningAnalyses || 0} running
                  </Text>
                </Group>
              </Group>

              {backendStatus?.tagoConnection.sdkVersion && (
                <Group justify="space-between">
                  <Text size="sm">SDK Version:</Text>
                  <Text size="sm" c="dimmed">
                    {backendStatus.tagoConnection.sdkVersion}
                  </Text>
                </Group>
              )}

              {backendStatus?.container_health.uptime && (
                <Group justify="space-between">
                  <Text size="sm">Uptime:</Text>
                  <Text size="sm" c="dimmed">
                    {backendStatus.container_health.uptime.formatted}
                  </Text>
                </Group>
              )}
            </Stack>

            {isDisconnected && (
              <>
                <Divider />
                <Stack gap="xs">
                  <Text size="sm" c="dimmed">
                    {getStatusText()}
                  </Text>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={handleRetryConnection}
                    leftSection={<IconRefresh size={14} />}
                  >
                    Refresh Status
                  </Button>
                </Stack>
              </>
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </>
  );
};

export default ConnectionStatus;
