// frontend/src/components/connectionStatus.jsx
import { useState } from 'react';
import { useConnection, useBackend } from '../../contexts/sseContext';
import {
  ActionIcon,
  Popover,
  Stack,
  Group,
  Text,
  Button,
  Divider,
  Box,
  Indicator,
} from '@mantine/core';
import { IconRefresh, IconSettings } from '@tabler/icons-react';
import { modalService } from '../../modals/modalService';

const ConnectionStatus = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { connectionStatus, requestStatusUpdate } = useConnection();
  const { backendStatus } = useBackend();

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
    if (disconnectedCount >= 1) return 'yellow';
    return 'green';
  };

  const getStatusText = () => {
    if (!backendStatus) return 'Loading...';
    if (connectionStatus === 'server_restarting') return 'Server Restarting...';
    if (connectionStatus === 'manual_restart_required')
      return 'Manual Restart Required';
    if (connectionStatus !== 'connected') return 'Disconnected from Server';
    if (backendStatus.container_health.status !== 'healthy')
      return 'Partially Disconnected';
    if (backendStatus.tagoConnection.runningAnalyses === 0) {
      return 'No Running Analyses';
    }
    return 'Connected';
  };

  const getStatusGradient = (status) => {
    switch (status) {
      case 'green':
        return 'linear-gradient(135deg, var(--mantine-color-teal-6) 0%, var(--mantine-color-green-6) 100%)';
      case 'yellow':
        return 'linear-gradient(135deg, var(--mantine-color-yellow-6) 0%, var(--mantine-color-orange-6) 100%)';
      case 'red':
        return 'linear-gradient(135deg, var(--mantine-color-red-6) 0%, var(--mantine-color-pink-6) 100%)';
      default:
        return 'var(--brand-gradient)';
    }
  };

  const handleRetryConnection = () => {
    requestStatusUpdate();
  };

  const handleOpenSettings = () => {
    setIsExpanded(false);
    modalService.openSettings();
  };

  if (!backendStatus && connectionStatus === 'connecting') {
    return null;
  }

  const overallColor = getOverallStatusColor();
  const isDisconnected =
    connectionStatus !== 'connected' ||
    (backendStatus &&
      (backendStatus.container_health.status !== 'healthy' ||
        backendStatus.tagoConnection.runningAnalyses === 0));

  return (
    <>
      <Popover
        opened={isExpanded}
        onChange={setIsExpanded}
        width={320}
        position="bottom-end"
        withArrow
        shadow="lg"
        styles={{
          dropdown: {
            border: '1px solid var(--mantine-color-gray-3)',
            backdropFilter: 'blur(10px)',
          },
        }}
      >
        <Popover.Target>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Enhanced status indicator with gradient and animation */}
            <Box
              className={`connection-status-indicator ${connectionStatus}`}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: getStatusGradient(overallColor),
                border: '2px solid var(--mantine-color-body)',
                boxShadow: `0 2px 8px ${getStatusGradient(overallColor)}33`,
                position: 'relative',
              }}
            >
              {connectionStatus === 'connecting' && (
                <Box
                  style={{
                    position: 'absolute',
                    inset: '-4px',
                    borderRadius: '50%',
                    background: getStatusGradient(overallColor),
                    opacity: 0.3,
                    animation: 'pulse 2s infinite',
                  }}
                />
              )}
            </Box>
          </ActionIcon>
        </Popover.Target>

        <Popover.Dropdown>
          <Stack>
            <Group justify="space-between">
              <Text fw={600} size="md" c="brand.5">
                System Status
              </Text>
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: getStatusGradient(overallColor),
                }}
              />
            </Group>

            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm">Backend:</Text>
                <Group gap="xs">
                  <Indicator
                    color={
                      backendStatus &&
                      backendStatus.container_health.status === 'healthy'
                        ? 'teal'
                        : 'red'
                    }
                    size={8}
                    styles={{
                      indicator: {
                        background:
                          backendStatus &&
                          backendStatus.container_health.status === 'healthy'
                            ? 'linear-gradient(135deg, var(--mantine-color-teal-6) 0%, var(--mantine-color-green-6) 100%)'
                            : 'linear-gradient(135deg, var(--mantine-color-red-6) 0%, var(--mantine-color-pink-6) 100%)',
                      },
                    }}
                  >
                    <Box />
                  </Indicator>
                  <Text size="sm" tt="capitalize" fw={500}>
                    {backendStatus?.container_health.status || 'unknown'}
                  </Text>
                </Group>
              </Group>

              <Group justify="space-between">
                <Text size="sm">SSE:</Text>
                <Group gap="xs">
                  <Indicator
                    color={connectionStatus === 'connected' ? 'teal' : 'red'}
                    size={8}
                    styles={{
                      indicator: {
                        background:
                          connectionStatus === 'connected'
                            ? 'linear-gradient(135deg, var(--mantine-color-teal-6) 0%, var(--mantine-color-green-6) 100%)'
                            : 'linear-gradient(135deg, var(--mantine-color-red-6) 0%, var(--mantine-color-pink-6) 100%)',
                      },
                    }}
                  >
                    <Box />
                  </Indicator>
                  <Text size="sm" tt="capitalize" fw={500}>
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
                        ? 'teal'
                        : 'yellow'
                    }
                    size={8}
                    styles={{
                      indicator: {
                        background:
                          backendStatus &&
                          backendStatus.tagoConnection.runningAnalyses > 0
                            ? 'linear-gradient(135deg, var(--mantine-color-teal-6) 0%, var(--mantine-color-green-6) 100%)'
                            : 'linear-gradient(135deg, var(--mantine-color-yellow-6) 0%, var(--mantine-color-orange-6) 100%)',
                      },
                    }}
                  >
                    <Box />
                  </Indicator>
                  <Text size="sm" fw={500}>
                    {backendStatus?.tagoConnection.runningAnalyses || 0} running
                  </Text>
                </Group>
              </Group>

              {backendStatus?.tagoConnection.sdkVersion && (
                <Group justify="space-between">
                  <Text size="sm">SDK Version:</Text>
                  <Text size="sm" ff="monospace">
                    {backendStatus.tagoConnection.sdkVersion}
                  </Text>
                </Group>
              )}

              {backendStatus?.container_health.uptime && (
                <Group justify="space-between">
                  <Text size="sm">Uptime:</Text>
                  <Text size="sm" ff="monospace">
                    {backendStatus.container_health.uptime.formatted}
                  </Text>
                </Group>
              )}
            </Stack>

            <Divider />
            <Stack gap="xs">
              {isDisconnected && (
                <>
                  <Text size="sm" c="dimmed" fw={500}>
                    {getStatusText()}
                  </Text>
                  <Button
                    variant="gradient"
                    gradient={{ from: 'brand.5', to: 'accent.6' }}
                    size="xs"
                    onClick={handleRetryConnection}
                    leftSection={<IconRefresh size={14} />}
                  >
                    Refresh Status
                  </Button>
                </>
              )}
              <Button
                variant="light"
                size="xs"
                onClick={handleOpenSettings}
                leftSection={<IconSettings size={14} />}
                fullWidth
              >
                Settings
              </Button>
            </Stack>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </>
  );
};

export default ConnectionStatus;
