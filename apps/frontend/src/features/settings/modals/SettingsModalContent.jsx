import { useState, lazy, Suspense } from 'react';
import { Stack, Group, Text, Tabs, Box, ScrollArea } from '@mantine/core';
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

// Modal content height - accounts for modal header/padding
const MODAL_CONTENT_HEIGHT = 'calc(85vh - 60px)';

/**
 * SettingsModalContent
 *
 * Modal content for application settings with tabbed interface.
 * Provides access to API documentation, metrics dashboard, utilities documentation, and DNS cache settings.
 *
 * Architecture:
 * - Sidebar stays fixed in place (sticky positioning)
 * - Single ScrollArea wraps the content panels
 * - Individual tabs should NOT have their own ScrollAreas
 *
 * Props (via innerProps):
 * - initialTab: Initial tab to display ('api' | 'utils' | 'metrics' | 'dns')
 * - focusAnalysisId: Analysis ID to focus on in DNS tab
 */
const SettingsModalContent = ({ innerProps }) => {
  const { initialTab, focusAnalysisId } = innerProps || {};
  const { isAdmin } = usePermissions();

  // Validate initialTab - non-admins can't access admin-only tabs (dns, utils)
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
      <Box
        style={{
          display: 'flex',
          gap: 'var(--mantine-spacing-md)',
          height: MODAL_CONTENT_HEIGHT,
          width: '100%',
        }}
      >
        {/* Sidebar - Sticky, does not scroll */}
        <Box
          style={{
            minWidth: 100,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            alignSelf: 'flex-start',
          }}
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
        </Box>

        {/* Content Area - Single ScrollArea for all tab content */}
        <ScrollArea
          style={{ flex: 1 }}
          h="100%"
          type="scroll"
          scrollbarSize={8}
          offsetScrollbars
        >
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
            {/* API tab - iframe with loading state */}
            <Tabs.Panel value="api">
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
            </Tabs.Panel>

            {/* Lazy-loaded tabs */}
            {isAdmin && (
              <Tabs.Panel value="utils">
                <UtilsDocs />
              </Tabs.Panel>
            )}

            <Tabs.Panel value="metrics">
              <MetricsDashboard />
            </Tabs.Panel>

            {isAdmin && (
              <Tabs.Panel value="dns">
                <DNSCacheSettings focusAnalysisId={focusAnalysisId} />
              </Tabs.Panel>
            )}
          </Suspense>
        </ScrollArea>
      </Box>
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
