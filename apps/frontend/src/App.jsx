// frontend/src/App.jsx
import { useState, lazy, Suspense } from 'react';
import { AppShell, Text, Burger, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { SSEProvider, useAnalyses, useConnection } from './contexts/sseContext';
import { CombinedAuthProvider } from './contexts/CombinedAuthProvider';
import { PermissionsProvider } from './contexts/PermissionsContext/index.js';
import { useAuth } from './hooks/useAuth';
import { usePermissions } from './hooks/usePermissions';
// Import core components directly to avoid context timing issues
import TeamSidebar from './components/layout/teamSidebar';
// Lazy load heavy components that make API calls
const AnalysisList = lazy(() => import('./components/analysis/analysisList'));
const AnalysisCreator = lazy(
  () => import('./components/analysis/uploadAnalysis'),
);
const LoginPage = lazy(() => import('./components/auth/LoginPage'));
import ConnectionStatus from './components/common/connectionStatus';
import Logo from './components/ui/logo';
import ImpersonationBanner from './components/layout/impersonationBanner';
import ThemeSelector from './components/ui/themeSelector';
import ErrorBoundary from './components/ErrorBoundary';
import AppLoadingOverlay from './components/common/AppLoadingOverlay';
import ChunkLoadErrorBoundary from './components/common/ChunkLoadErrorBoundary';

function AppContent() {
  const { analyses } = useAnalyses();
  const { connectionStatus } = useConnection();
  const { isAdmin } = useAuth();
  const { canUploadToAnyTeam, isTeamMember } = usePermissions();

  const [selectedTeam, setSelectedTeam] = useState(null);
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  const getFilteredAnalyses = () => {
    // For admins, show all analyses
    if (isAdmin) {
      if (!selectedTeam) {
        return analyses;
      }
      // Filter by selected department only
      const filteredAnalyses = {};
      Object.entries(analyses).forEach(([name, analysis]) => {
        if (analysis.teamId === selectedTeam) {
          filteredAnalyses[name] = analysis;
        }
      });
      return filteredAnalyses;
    }

    // For non-admin users, only show analyses from teams they have access to
    const filteredAnalyses = {};
    Object.entries(analyses).forEach(([name, analysis]) => {
      // If a specific team is selected, filter by that team
      if (selectedTeam) {
        if (
          analysis.teamId === selectedTeam ||
          (selectedTeam === 'uncategorized' &&
            (!analysis.teamId || analysis.teamId === 'uncategorized'))
        ) {
          filteredAnalyses[name] = analysis;
        }
      } else {
        // For "All Analyses", only show analyses from teams user has access to
        if (
          // Analysis has no team (uncategorized) and user has access to uncategorized
          (!analysis.teamId && isTeamMember('uncategorized')) ||
          // Analysis has team and user is member of that team
          (analysis.teamId && isTeamMember(analysis.teamId))
        ) {
          filteredAnalyses[name] = analysis;
        }
      }
    });
    return filteredAnalyses;
  };

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
            <ChunkLoadErrorBoundary componentName="Analysis Creator">
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
            </ChunkLoadErrorBoundary>
          )}
          <ChunkLoadErrorBoundary componentName="Analysis List">
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
                analyses={getFilteredAnalyses()}
                showTeamLabels={!selectedTeam}
                selectedTeam={selectedTeam}
              />
            </Suspense>
          </ChunkLoadErrorBoundary>
        </AppShell.Main>
      </AppShell>
    </>
  );
}

// Authenticated App Content with SSE
function AuthenticatedApp() {
  return (
    <SSEProvider>
      <PermissionsProvider>
        <AppContent />
      </PermissionsProvider>
    </SSEProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CombinedAuthProvider>
        <AppRouter />
      </CombinedAuthProvider>
    </ErrorBoundary>
  );
}

// Router component to conditionally load authenticated vs login components
function AppRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading overlay during initial auth check
  if (isLoading) {
    return <AppLoadingOverlay message="Verifying authentication..." />;
  }

  if (!isAuthenticated) {
    return (
      <ChunkLoadErrorBoundary componentName="Login Page">
        <Suspense fallback={<AppLoadingOverlay message="Loading..." />}>
          <LoginPage />
        </Suspense>
      </ChunkLoadErrorBoundary>
    );
  }

  // Only load SSE and heavy components when authenticated
  return <AuthenticatedApp />;
}
