import { useState } from 'react';
import { AppShell, Text, Burger, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ModalsProvider } from '@mantine/modals';
import { SSEProvider, useConnection } from './contexts/sseContext';
import { PermissionsProvider, useAuth } from './features/auth';
import { useFilteredAnalyses } from './features/analysis';
// Core components - always visible, no lazy loading needed
import TeamSidebar from './components/layout/teamSidebar';
import AnalysisList from './features/analysis/components/analysisList';
import ConnectionStatus from './components/common/connectionStatus';
import Logo from './components/ui/logo';
import ImpersonationBanner, {
  IMPERSONATION_BANNER_HEIGHT,
} from './components/layout/impersonationBanner';
import ThemeSelector from './components/ui/themeSelector';
import ErrorBoundary from './components/ErrorBoundary';
import AppLoadingOverlay from './components/global/indicators/AppLoadingOverlay';
// Import modal components registry
import modalComponents from './modals/registry.jsx';

function AppContent() {
  const { connectionStatus, hasInitialData } = useConnection();
  const { isImpersonating } = useAuth();

  const [selectedTeam, setSelectedTeam] = useState(null);
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  // Use custom hook for filtered analyses
  const filteredAnalyses = useFilteredAnalyses(selectedTeam);

  const connectionFailed = connectionStatus === 'failed';

  // Calculate header height offset when impersonating
  const headerHeight = 60;
  const topOffset = isImpersonating ? IMPERSONATION_BANNER_HEIGHT : 0;

  // Show error state if connection failed
  if (connectionFailed) {
    return (
      <AppLoadingOverlay
        message="Connection Failed"
        submessage="Unable to connect to the Tago Analysis Worker server. Please ensure the backend server is running and accessible."
        error={true}
        showRetry={true}
      />
    );
  }

  // Wait for SSE connection + initial data before rendering the app
  // This prevents showing empty states while data is loading
  if (!hasInitialData) {
    return <AppLoadingOverlay message="Loading application..." />;
  }

  return (
    <>
      <ImpersonationBanner />
      <AppShell
        header={{ height: headerHeight }}
        navbar={{
          width: 280,
          breakpoint: 'sm',
          collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
        }}
        padding="md"
        style={{
          '--app-shell-header-offset': `${topOffset}px`,
        }}
      >
        <AppShell.Header style={{ top: topOffset }}>
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Burger
                opened={mobileOpened}
                onClick={toggleMobile}
                hiddenFrom="sm"
                size="sm"
              />
              <Burger
                opened={desktopOpened}
                onClick={toggleDesktop}
                visibleFrom="sm"
                size="sm"
              />
              <Group gap="sm">
                <Logo size={48} />
                <Text
                  size="xl"
                  fw={800}
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                >
                  Tago Analysis Worker
                </Text>
              </Group>
            </Group>
            <Group>
              <ThemeSelector />
              <ConnectionStatus />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar
          style={{
            top: headerHeight + topOffset,
            height: `calc(100vh - ${headerHeight + topOffset}px)`,
          }}
        >
          <TeamSidebar
            selectedTeam={selectedTeam}
            onTeamSelect={setSelectedTeam}
          />
        </AppShell.Navbar>

        <AppShell.Main
          style={{
            background: 'var(--mantine-color-body)',
            paddingTop: `calc(var(--app-shell-header-height) + ${topOffset}px + var(--mantine-spacing-md))`,
          }}
        >
          <ErrorBoundary variant="component" componentName="Analysis List">
            <AnalysisList
              analyses={filteredAnalyses}
              showTeamLabels={!selectedTeam}
              selectedTeam={selectedTeam}
            />
          </ErrorBoundary>
        </AppShell.Main>
      </AppShell>
    </>
  );
}

// Authenticated App Content with SSE
export default function AuthenticatedApp() {
  return (
    <SSEProvider>
      <PermissionsProvider>
        <ModalsProvider
          modals={modalComponents}
          labels={{ confirm: 'Confirm', cancel: 'Cancel' }}
        >
          <AppContent />
        </ModalsProvider>
      </PermissionsProvider>
    </SSEProvider>
  );
}
