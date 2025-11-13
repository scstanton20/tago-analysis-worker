import { useState, lazy, Suspense } from 'react';
import { AppShell, Text, Burger, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ModalsProvider } from '@mantine/modals';
import { SSEProvider, useConnection } from './contexts/sseContext';
import { PermissionsProvider } from './contexts/PermissionsContext/index.js';
import { usePermissions } from './hooks/usePermissions';
import { useFilteredAnalyses } from './hooks/useFilteredAnalyses';
// Import core components directly to avoid context timing issues
import TeamSidebar from './components/layout/teamSidebar';
// Lazy load heavy components that make API calls
const AnalysisList = lazy(() => import('./components/analysis/analysisList'));
const AnalysisCreator = lazy(
  () => import('./components/analysis/uploadAnalysis'),
);
import ConnectionStatus from './components/common/connectionStatus';
import Logo from './components/ui/logo';
import ImpersonationBanner from './components/layout/impersonationBanner';
import ThemeSelector from './components/ui/themeSelector';
import ErrorBoundary from './components/ErrorBoundary';
import AppLoadingOverlay from './components/common/AppLoadingOverlay';
// Import modal components registry
import modalComponents from './modals/registry.jsx';

function AppContent() {
  const { connectionStatus } = useConnection();
  const { canUploadToAnyTeam } = usePermissions();

  const [selectedTeam, setSelectedTeam] = useState(null);
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  // Use custom hook for filtered analyses
  const filteredAnalyses = useFilteredAnalyses(selectedTeam);

  const connectionFailed = connectionStatus === 'failed';

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

  return (
    <>
      <ImpersonationBanner />
      <AppShell
        header={{ height: 60 }}
        navbar={{
          width: 280,
          breakpoint: 'sm',
          collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
        }}
        padding="md"
      >
        <AppShell.Header>
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

        <AppShell.Navbar>
          <TeamSidebar
            selectedTeam={selectedTeam}
            onTeamSelect={setSelectedTeam}
          />
        </AppShell.Navbar>

        <AppShell.Main
          style={{
            background: 'var(--mantine-color-body)',
          }}
        >
          {canUploadToAnyTeam() && (
            <ErrorBoundary variant="component" componentName="Analysis Creator">
              <Suspense
                fallback={
                  <AppLoadingOverlay
                    message="Connecting to Tago Analysis Worker..."
                    submessage={
                      (connectionStatus === 'connecting' &&
                        'Establishing server connection...') ||
                      (connectionStatus === 'disconnected' &&
                        'Connection lost, retrying...') ||
                      (connectionStatus === 'server_shutdown' &&
                        'Server is restarting, please wait...') ||
                      ''
                    }
                  />
                }
              >
                <AnalysisCreator targetTeam={selectedTeam} />
              </Suspense>
            </ErrorBoundary>
          )}
          <ErrorBoundary variant="component" componentName="Analysis List">
            <Suspense
              fallback={
                <AppLoadingOverlay
                  message="Connecting to Tago Analysis Worker..."
                  submessage={
                    (connectionStatus === 'connecting' &&
                      'Establishing server connection...') ||
                    (connectionStatus === 'disconnected' &&
                      'Connection lost, retrying...') ||
                    (connectionStatus === 'server_shutdown' &&
                      'Server is restarting, please wait...') ||
                    ''
                  }
                />
              }
            >
              <AnalysisList
                analyses={filteredAnalyses}
                showTeamLabels={!selectedTeam}
                selectedTeam={selectedTeam}
              />
            </Suspense>
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
