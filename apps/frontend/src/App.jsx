// frontend/src/App.jsx
import { useState, lazy, Suspense } from 'react';
import {
  AppShell,
  Text,
  Burger,
  Group,
  Tooltip,
  LoadingOverlay,
  Stack,
  Button,
  useComputedColorScheme,
  useMantineColorScheme,
  Switch,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSun, IconMoon } from '@tabler/icons-react';
import { useSSE } from './contexts/sseContext';
import { SSEProvider } from './contexts/sseContext/provider';
import { AuthProvider } from './contexts/authContext';
import { useAuth } from './hooks/useAuth';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { usePermissions } from './hooks/usePermissions';
// Lazy load heavy components that make API calls
const DepartmentalSidebar = lazy(
  () => import('./components/departmentalSidebar'),
);
const AnalysisList = lazy(() => import('./components/analysis/analysisList'));
const AnalysisCreator = lazy(
  () => import('./components/analysis/uploadAnalysis'),
);
import ConnectionStatus from './components/connectionStatus';
import LoginPage from './components/auth/LoginPage';
import ForcePasswordChange from './components/auth/PasswordOnboarding';
import Logo from './components/logo';

// Reusable loading overlay component
function AppLoadingOverlay({ message, submessage, error, showRetry }) {
  return (
    <LoadingOverlay
      visible={true}
      zIndex={1000}
      overlayProps={{ blur: 2, radius: 'sm' }}
      loaderProps={{
        size: 'xl',
        children: (
          <Stack align="center" gap="lg">
            <Logo size={48} className={error ? '' : 'pulse'} />
            <Text size="lg" fw={500} c={error ? 'red' : undefined}>
              {message}
            </Text>
            {submessage && (
              <Text size="sm" c="dimmed" ta="center" maw={400}>
                {submessage}
              </Text>
            )}
            {showRetry && (
              <Button
                onClick={() => window.location.reload()}
                variant="gradient"
                gradient={{ from: 'brand.6', to: 'accent.6' }}
                mt="md"
              >
                Retry Connection
              </Button>
            )}
          </Stack>
        ),
      }}
      pos="fixed"
    />
  );
}

function AppContent() {
  const { analyses, departments, getDepartment, connectionStatus } = useSSE();
  const { canUploadAnalyses, canAccessDepartment, canViewAnalyses, isAdmin } =
    usePermissions();

  // Enable idle timeout for authenticated users
  useIdleTimeout();

  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');

  const getFilteredAnalyses = () => {
    // For admins, show all analyses
    if (isAdmin) {
      if (!selectedDepartment) {
        return analyses;
      }
      // Filter by selected department only
      const filteredAnalyses = {};
      Object.entries(analyses).forEach(([name, analysis]) => {
        if (analysis.department === selectedDepartment) {
          filteredAnalyses[name] = analysis;
        }
      });
      return filteredAnalyses;
    }

    // For non-admin users, filter by department access and file view permission
    const filteredAnalyses = {};
    Object.entries(analyses).forEach(([name, analysis]) => {
      // First check if user has view_analyses permission
      if (!canViewAnalyses()) {
        return; // Skip if no view permission
      }

      // Allow access if:
      // 1. User has access to the analysis's department, OR
      // 2. Analysis is uncategorized (null, undefined, or 'uncategorized')
      // 3. Analysis has no department set
      const isUncategorized =
        !analysis.department || analysis.department === 'uncategorized';
      const hasDeptAccess = analysis.department
        ? canAccessDepartment(analysis.department)
        : false;

      const canAccess = hasDeptAccess || isUncategorized;

      if (canAccess) {
        // If a specific department is selected, also filter by that
        // Always show if no department filter is active OR matches the selected department
        // Also show uncategorized items when showing "All Departments"
        if (
          !selectedDepartment ||
          analysis.department === selectedDepartment ||
          (selectedDepartment === 'uncategorized' && isUncategorized)
        ) {
          filteredAnalyses[name] = analysis;
        }
      }
    });
    return filteredAnalyses;
  };

  // Get current department using object lookup
  const currentDepartment = selectedDepartment
    ? getDepartment(selectedDepartment)
    : null;

  const connectionFailed = connectionStatus === 'failed';

  if (connectionFailed) {
    return (
      <AppLoadingOverlay
        message="Connection Failed"
        submessage="Unable to connect to the Tago Analysis Runner server. Please ensure the backend server is running and accessible."
        error={true}
        showRetry={true}
      />
    );
  }

  return (
    <>
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
                  Tago Analysis Runner
                </Text>
              </Group>
            </Group>
            <Group>
              <Tooltip
                label={
                  computedColorScheme === 'light'
                    ? 'Switch to dark mode'
                    : 'Switch to light mode'
                }
              >
                <Group gap="xs">
                  <IconSun
                    size={16}
                    style={{
                      opacity: computedColorScheme === 'light' ? 1 : 0.5,
                      color:
                        computedColorScheme === 'light'
                          ? 'var(--mantine-color-brand-6)'
                          : 'var(--mantine-color-gray-5)',
                    }}
                  />
                  <Switch
                    checked={computedColorScheme === 'dark'}
                    onChange={() =>
                      setColorScheme(
                        computedColorScheme === 'dark' ? 'light' : 'dark',
                      )
                    }
                    size="md"
                    onLabel=""
                    offLabel=""
                    color="brand"
                    styles={{
                      track: {
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                        borderColor:
                          computedColorScheme === 'dark'
                            ? 'var(--mantine-color-brand-4)'
                            : 'var(--mantine-color-gray-4)',
                        border: '1px solid',
                        '&[dataChecked]': {
                          backgroundColor: 'var(--mantine-color-brand-1)',
                          borderColor: 'var(--mantine-color-brand-6)',
                        },
                      },
                      thumb: {
                        cursor: 'pointer',
                        backgroundColor:
                          computedColorScheme === 'dark'
                            ? 'var(--mantine-color-brand-6)'
                            : 'var(--mantine-color-gray-6)',
                        border: 'none',
                        '&[dataChecked]': {
                          backgroundColor: 'var(--mantine-color-brand-7)',
                        },
                      },
                    }}
                  />
                  <IconMoon
                    size={16}
                    style={{
                      opacity: computedColorScheme === 'dark' ? 1 : 0.5,
                      color:
                        computedColorScheme === 'dark'
                          ? 'var(--mantine-color-brand-6)'
                          : 'var(--mantine-color-gray-5)',
                    }}
                  />
                </Group>
              </Tooltip>
              <ConnectionStatus />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar>
          <DepartmentalSidebar
            selectedDepartment={selectedDepartment}
            onDepartmentSelect={setSelectedDepartment}
            opened={desktopOpened}
            onToggle={toggleDesktop}
          />
        </AppShell.Navbar>

        <AppShell.Main
          style={{
            background: 'var(--mantine-color-body)',
          }}
        >
          {canUploadAnalyses() && (
            <Suspense
              fallback={
                <AppLoadingOverlay
                  message="Connecting to Tago Analysis Runner..."
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
              <AnalysisCreator
                targetDepartment={selectedDepartment}
                departmentName={currentDepartment?.name || 'All Departments'}
              />
            </Suspense>
          )}
          <Suspense
            fallback={
              <AppLoadingOverlay
                message="Connecting to Tago Analysis Runner..."
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
              showDepartmentLabels={!selectedDepartment}
              departments={departments}
              selectedDepartment={selectedDepartment}
            />
          </Suspense>
        </AppShell.Main>
      </AppShell>
    </>
  );
}

// Authenticated App Content with SSE
function AuthenticatedApp() {
  return (
    <SSEProvider>
      <AppContent />
    </SSEProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

// Router component to conditionally load authenticated vs login components
function AppRouter() {
  const { isAuthenticated, user, isLoading } = useAuth();

  // Show loading overlay during initial auth check
  if (isLoading) {
    return <AppLoadingOverlay message="Verifying authentication..." />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Check if user must change password
  if (user?.mustChangePassword) {
    return (
      <ForcePasswordChange
        username={user.username}
        onSuccess={() => window.location.reload()}
      />
    );
  }

  // Only load SSE and heavy components when authenticated
  return <AuthenticatedApp />;
}
