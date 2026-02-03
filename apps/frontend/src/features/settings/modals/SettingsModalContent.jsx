import { useState, lazy, Suspense } from 'react';
import { Stack, Group, Text, Tabs, ScrollArea } from '@mantine/core';
import {
  IconBook,
  IconTransfer,
  IconChartBar,
  IconCode,
} from '@tabler/icons-react';
import PropTypes from 'prop-types';
import { PaperCard, LoadingState, SecondaryButton } from '@/components/global';
import { usePermissions } from '@/features/auth/hooks/usePermissions';
import IframeLoader from '@/modals/IframeLoader';
const DNSCacheSettings = lazy(() => import('../components/DNSCacheSettings'));
const MetricsDashboard = lazy(() => import('../components/MetricsDashboard'));
const UtilsDocs = lazy(() => import('../components/UtilsDocs'));

// ScrollArea height — modal is 85vh, minus header (~52px) and body padding (~32px)
const SCROLL_HEIGHT = 'calc(85vh - 84px)';

const scrollAreaStyles = {
  thumb: { backgroundColor: 'var(--mantine-color-brand-6)' },
};

/**
 * SettingsModalContent
 *
 * Modal content for application settings with tabbed interface.
 * Uses Mantine vertical Tabs for the sidebar layout.
 * Each tab panel wraps its content in a ScrollArea with a fixed height
 * so the sidebar never scrolls.
 *
 * Props (via innerProps):
 * - initialTab: Initial tab to display ('api' | 'utils' | 'metrics' | 'dns')
 * - focusAnalysisId: Analysis ID to focus on in DNS tab
 */
const SettingsModalContent = ({ innerProps }) => {
  const { initialTab, focusAnalysisId } = innerProps || {};
  const { isAdmin } = usePermissions();

  const adminOnlyTabs = ['dns', 'utils'];
  const validInitialTab =
    !isAdmin && adminOnlyTabs.includes(initialTab)
      ? 'api'
      : initialTab || 'api';
  const [activeTab, setActiveTab] = useState(validInitialTab);

  const handleOpenApiDocs = () => {
    const apiDocsUrl = `${window.location.origin}/api/docs`;
    window.open(apiDocsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Tabs
      value={activeTab}
      onChange={setActiveTab}
      orientation="vertical"
      color="brand"
    >
      <Tabs.List>
        <Tabs.Tab value="api" leftSection={<IconBook size={16} />}>
          API Docs
        </Tabs.Tab>
        {isAdmin && (
          <Tabs.Tab value="utils" leftSection={<IconCode size={16} />}>
            Utils & Packages Docs
          </Tabs.Tab>
        )}
        <Tabs.Tab value="metrics" leftSection={<IconChartBar size={16} />}>
          Metrics
        </Tabs.Tab>
        {isAdmin && (
          <Tabs.Tab value="dns" leftSection={<IconTransfer size={16} />}>
            DNS Cache
          </Tabs.Tab>
        )}
      </Tabs.List>

      <Tabs.Panel value="api" pl="md">
        <ScrollArea
          h={SCROLL_HEIGHT}
          type="scroll"
          scrollbarSize={8}
          styles={scrollAreaStyles}
        >
          <Suspense
            fallback={
              <LoadingState
                loading
                skeleton
                pattern="content"
                skeletonCount={4}
              />
            }
          >
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text size="lg" fw={600}>
                  API Documentation
                </Text>
                <SecondaryButton
                  size="sm"
                  onClick={handleOpenApiDocs}
                  leftSection={<IconBook size={16} />}
                >
                  Open in New Tab
                </SecondaryButton>
              </Group>
              <PaperCard>
                <IframeLoader
                  src={`${window.location.origin}/api/docs`}
                  title="API Documentation"
                  height="1000px"
                />
              </PaperCard>
            </Stack>
          </Suspense>
        </ScrollArea>
      </Tabs.Panel>

      {isAdmin && (
        <Tabs.Panel value="utils" pl="md">
          <Suspense
            fallback={
              <LoadingState
                loading
                skeleton
                pattern="content"
                skeletonCount={4}
              />
            }
          >
            <UtilsDocs scrollHeight={SCROLL_HEIGHT} />
          </Suspense>
        </Tabs.Panel>
      )}

      <Tabs.Panel value="metrics" pl="md">
        <ScrollArea
          h={SCROLL_HEIGHT}
          type="scroll"
          scrollbarSize={8}
          styles={scrollAreaStyles}
        >
          <Suspense
            fallback={
              <LoadingState
                loading
                skeleton
                pattern="content"
                skeletonCount={4}
              />
            }
          >
            <MetricsDashboard />
          </Suspense>
        </ScrollArea>
      </Tabs.Panel>

      {isAdmin && (
        <Tabs.Panel value="dns" pl="md">
          <ScrollArea
            h={SCROLL_HEIGHT}
            type="scroll"
            scrollbarSize={8}
            styles={scrollAreaStyles}
          >
            <Suspense
              fallback={
                <LoadingState
                  loading
                  skeleton
                  pattern="content"
                  skeletonCount={4}
                />
              }
            >
              <DNSCacheSettings focusAnalysisId={focusAnalysisId} />
            </Suspense>
          </ScrollArea>
        </Tabs.Panel>
      )}
    </Tabs>
  );
};

SettingsModalContent.propTypes = {
  innerProps: PropTypes.shape({
    initialTab: PropTypes.oneOf(['api', 'utils', 'metrics', 'dns']),
    focusAnalysisId: PropTypes.string,
  }),
};

export default SettingsModalContent;
