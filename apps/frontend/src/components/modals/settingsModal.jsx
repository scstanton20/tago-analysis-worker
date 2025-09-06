import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Paper,
  Tabs,
  Box,
} from '@mantine/core';
import {
  IconSettings,
  IconBook,
  IconTransfer,
  IconChartBar,
} from '@tabler/icons-react';
import DNSCacheSettings from '../modals/settings/DNSCacheSettings';
import MetricsDashboard from '../metrics/MetricsDashboard';

export default function SettingsModal({ opened, onClose }) {
  const [activeTab, setActiveTab] = useState('api');

  const handleOpenApiDocs = () => {
    const apiDocsUrl = `${window.location.origin}/api/docs`;
    window.open(apiDocsUrl, '_blank', 'noopener,noreferrer');
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <IconSettings size={20} />
          <Text fw={600}>Settings</Text>
        </Group>
      }
      size="95%"
      centered
    >
      <Tabs value={activeTab} onChange={setActiveTab} orientation="vertical">
        <Group align="flex-start" gap="md" style={{ minHeight: 400 }}>
          {/* Sidebar */}
          <Box style={{ minWidth: 100 }}>
            <Tabs.List>
              <Tabs.Tab value="api" leftSection={<IconBook size={16} />}>
                API Docs
              </Tabs.Tab>
              <Tabs.Tab
                value="metrics"
                leftSection={<IconChartBar size={16} />}
              >
                Metrics
              </Tabs.Tab>
              <Tabs.Tab value="dns" leftSection={<IconTransfer size={16} />}>
                DNS Cache
              </Tabs.Tab>
            </Tabs.List>
          </Box>

          {/* Content Area */}
          <Box style={{ flex: 1 }}>
            <Tabs.Panel value="api">
              <Stack gap="md">
                <Text size="lg" fw={600} mb="sm">
                  API & Documentation
                </Text>
                <Paper p="md" withBorder>
                  <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                      Access API documentation and developer resources.
                    </Text>
                    <Button
                      variant="light"
                      size="sm"
                      onClick={handleOpenApiDocs}
                      leftSection={<IconBook size={16} />}
                      fullWidth
                    >
                      Open API Documentation
                    </Button>
                  </Stack>
                </Paper>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="metrics">
              <MetricsDashboard />
            </Tabs.Panel>

            <Tabs.Panel value="dns">
              <DNSCacheSettings />
            </Tabs.Panel>
          </Box>
        </Group>
      </Tabs>
    </Modal>
  );
}

SettingsModal.propTypes = {
  opened: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
