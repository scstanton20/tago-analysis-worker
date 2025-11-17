import { useState, lazy, Suspense } from 'react';
import { Stack, Group, Text, Tabs, Box } from '@mantine/core';
import {
  IconBook,
  IconTransfer,
  IconChartBar,
  IconCode,
} from '@tabler/icons-react';
import {
  PaperCard,
  LoadingState,
  SecondaryButton,
} from '../../components/global';
const DNSCacheSettings = lazy(() => import('./settings/DNSCacheSettings'));
const MetricsDashboard = lazy(() => import('./settings/MetricsDashboard'));
const UtilsDocs = lazy(() => import('./settings/UtilsDocs'));

/**
 * SettingsModalContent
 *
 * Modal content for application settings with tabbed interface.
 * Provides access to API documentation, metrics dashboard, utilities documentation, and DNS cache settings.
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
      <Group align="flex-start" gap="md" style={{ minHeight: 800 }}>
        {/* Sidebar */}
        <Box style={{ minWidth: 100 }}>
          <Tabs.List>
            <Tabs.Tab value="api" leftSection={<IconBook size={16} />}>
              API Docs
            </Tabs.Tab>
            <Tabs.Tab value="utils" leftSection={<IconCode size={16} />}>
              Utils Docs
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
          {/* API tab - no lazy loading needed */}
          <Tabs.Panel value="api">
            <Stack gap="md">
              <Text size="lg" fw={600} mb="sm">
                API Documentation
              </Text>
              <PaperCard>
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
              </PaperCard>
            </Stack>
          </Tabs.Panel>

          {/* Lazy-loaded tabs with individual Suspense boundaries */}
          <Tabs.Panel value="utils">
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
              <UtilsDocs />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="metrics">
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
              <MetricsDashboard />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="dns">
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
              <DNSCacheSettings />
            </Suspense>
          </Tabs.Panel>
        </Box>
      </Group>
    </Tabs>
  );
};

SettingsModalContent.propTypes = {};

export default SettingsModalContent;
