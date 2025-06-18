// frontend/src/App.jsx
import { useState } from 'react';
import {
  AppShell,
  Box,
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
import { useWebSocket } from './contexts/websocketContext';
import { WebSocketProvider } from './contexts/websocketContext/provider';
import DepartmentalSidebar from './components/departmentalSidebar';
import AnalysisList from './components/analysis/analysisList';
import AnalysisCreator from './components/analysis/uploadAnalysis';
import ConnectionStatus from './components/connectionStatus';
import Logo from './components/Logo';

function AppContent() {
  const {
    analyses,
    departments,
    getDepartment,
    connectionStatus,
    hasInitialData,
  } = useWebSocket();

  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');

  const getFilteredAnalyses = () => {
    if (!selectedDepartment) {
      // Return all analyses as object
      return analyses;
    }

    // Filter analyses by department and return as object
    const filteredAnalyses = {};
    Object.entries(analyses).forEach(([name, analysis]) => {
      if (analysis.department === selectedDepartment) {
        filteredAnalyses[name] = analysis;
      }
    });
    return filteredAnalyses;
  };

  // Get current department using object lookup
  const currentDepartment = selectedDepartment
    ? getDepartment(selectedDepartment)
    : null;

  // Show initial loading overlay only when we haven't loaded data yet
  const isInitialLoading =
    !hasInitialData &&
    (connectionStatus === 'connecting' || connectionStatus === 'disconnected');
  const connectionFailed = connectionStatus === 'failed';

  if (connectionFailed) {
    return (
      <Box
        ta="center"
        p="xl"
        style={{
          minHeight: '100vh',
          background: 'var(--mantine-color-body)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Stack align="center" gap="lg">
          <Logo size={64} />
          <Text size="xl" fw={600} c="red">
            Connection Failed
          </Text>
          <Text size="lg" c="dimmed" ta="center">
            Unable to connect to the Tago Analysis Runner server
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw={400}>
            Please ensure the backend server is running and accessible at the
            configured WebSocket endpoint.
          </Text>
          <Button
            onClick={() => window.location.reload()}
            variant="gradient"
            gradient={{ from: 'brand.6', to: 'accent.6' }}
            mt="md"
          >
            Retry Connection
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <>
      <LoadingOverlay
        visible={isInitialLoading}
        zIndex={1000}
        overlayProps={{ blur: 2, radius: 'sm' }}
        loaderProps={{
          size: 'xl',
          children: (
            <Stack align="center" gap="lg">
              <Logo size={48} className="pulse" />
              <Text size="lg" fw={500}>
                Connecting to Tago Analysis Runner...
              </Text>
              <Text size="sm" c="dimmed">
                {connectionStatus === 'connecting' &&
                  'Establishing WebSocket connection...'}
                {connectionStatus === 'disconnected' &&
                  'Connection lost, retrying...'}
              </Text>
            </Stack>
          ),
        }}
        pos="fixed"
      />

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
                        '&[data-checked]': {
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
                        '&[data-checked]': {
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
          <AnalysisCreator
            targetDepartment={selectedDepartment}
            departmentName={currentDepartment?.name || 'All Departments'}
          />
          <AnalysisList
            analyses={getFilteredAnalyses()}
            showDepartmentLabels={!selectedDepartment}
            departments={departments}
            selectedDepartment={selectedDepartment}
          />
        </AppShell.Main>
      </AppShell>
    </>
  );
}

export default function App() {
  return (
    <WebSocketProvider>
      <AppContent />
    </WebSocketProvider>
  );
}
