import { useState, lazy, Suspense } from 'react';
import { Stack, Group, Text, Tabs, Box } from '@mantine/core';
import { IconBook, IconTransfer, IconChartBar } from '@tabler/icons-react';
import {
  ContentBox,
  LoadingState,
  SecondaryButton,
} from '../../components/global';
const DNSCacheSettings = lazy(() => import('./settings/DNSCacheSettings'));
const MetricsDashboard = lazy(() => import('./settings/MetricsDashboard'));

/**
 * SettingsModalContent
 *
 * Modal content for application settings with tabbed interface.
 * Provides access to API documentation, metrics dashboard, and DNS cache settings.
 *
 * Note: This component does not accept any props.
 */
const SettingsModalContent = () => {
  const [activeTab, setActiveTab] = useState('api');

  const handleOpenApiDocs = () => {
    const apiDocsUrl = `${window.location.origin}/api/docs`;
    window.open(apiDocsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Tabs value={activeTab} onChange={setActiveTab} orientation="vertical">
      <Group align="flex-start" gap="md" style={{ minHeight: 400 }}>
        {/* Sidebar */}
        <Box style={{ minWidth: 100 }}>
          <Tabs.List>
            <Tabs.Tab value="api" leftSection={<IconBook size={16} />}>
              API Docs
            </Tabs.Tab>
            <Tabs.Tab value="metrics" leftSection={<IconChartBar size={16} />}>
              Metrics
            </Tabs.Tab>
            <Tabs.Tab value="dns" leftSection={<IconTransfer size={16} />}>
              DNS Cache
            </Tabs.Tab>
          </Tabs.List>
        </Box>

        {/* Content Area */}
        <Box style={{ flex: 1 }}>
          <Suspense
            fallback={
              <LoadingState
                loading={true}
                skeleton
                pattern="content"
                skeletonCount={4}
              />
            }
          >
            <Tabs.Panel value="api">
              <Stack gap="md">
                <Text size="lg" fw={600} mb="sm">
                  API Documentation
                </Text>
                <ContentBox>
                  <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                      Access API documentation and developer resources.
                    </Text>
                    <SecondaryButton
                      size="sm"
                      onClick={handleOpenApiDocs}
                      leftSection={<IconBook size={16} />}
                      fullWidth
                    >
                      Open API Documentation
                    </SecondaryButton>
                  </Stack>
                </ContentBox>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="metrics">
              <MetricsDashboard />
            </Tabs.Panel>

            <Tabs.Panel value="dns">
              <DNSCacheSettings />
            </Tabs.Panel>
          </Suspense>
        </Box>
      </Group>
    </Tabs>
  );
};

SettingsModalContent.propTypes = {};

export default SettingsModalContent;
