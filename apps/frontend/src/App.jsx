// frontend/src/App.jsx
import { useState } from 'react';
import {
  AppShell,
  Box,
  Text,
  useMantineTheme,
  Burger,
  Group,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSun, IconMoon } from '@tabler/icons-react';
import { useWebSocket } from './contexts/websocketContext';
import { ThemeProvider, useTheme } from './contexts/themeContext';
import { WebSocketProvider } from './contexts/websocketContext/provider';
import DepartmentalSidebar from './components/departmentalSidebar';
import AnalysisList from './components/analysis/analysisList';
import AnalysisCreator from './components/analysis/uploadAnalysis';
import ConnectionStatus from './components/connectionStatus';
import { useIsMobile } from './hooks/useIsMobile';

function AppContent() {
  const mantineTheme = useMantineTheme();
  const { theme, toggleTheme } = useTheme();
  const { analysesArray, departmentsArray } = useWebSocket();
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const isMobile = useIsMobile();

  // Filter analyses based on selected department
  const filteredAnalyses = selectedDepartment
    ? analysesArray?.filter(
        (analysis) => analysis.department === selectedDepartment,
      )
    : analysesArray;

  // Get current department info
  const currentDepartment = departmentsArray?.find(
    (d) => d.id === selectedDepartment,
  );

  if (isMobile) {
    return (
      <Box
        ta="center"
        p="xl"
        style={{
          minHeight: '100vh',
          background:
            theme === 'dark'
              ? `linear-gradient(135deg, ${mantineTheme.colors.dark[8]} 0%, ${mantineTheme.colors.dark[9]} 100%)`
              : `linear-gradient(135deg, ${mantineTheme.colors.gray[0]} 0%, ${mantineTheme.colors.gray[1]} 100%)`,
        }}
      >
        <Text size="lg" fw={500} mb="md">
          Mobile View Not Supported
        </Text>
        <Text c="dimmed">
          Please use a desktop browser to access this application.
        </Text>
      </Box>
    );
  }

  return (
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
            <Text size="lg" fw={600}>
              Tago Analysis Runner
            </Text>
          </Group>
          <Group>
            <Tooltip label={theme === 'light' ? 'Dark mode' : 'Light mode'}>
              <ActionIcon
                variant="subtle"
                onClick={() => toggleTheme()}
                size="lg"
              >
                {theme === 'light' ? (
                  <IconSun size={20} />
                ) : (
                  <IconMoon size={20} />
                )}
              </ActionIcon>
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
          background:
            theme === 'dark'
              ? `linear-gradient(135deg, ${mantineTheme.colors.dark[8]} 0%, ${mantineTheme.colors.dark[9]} 100%)`
              : `linear-gradient(135deg, ${mantineTheme.colors.gray[0]} 0%, ${mantineTheme.colors.gray[1]} 100%)`,
        }}
      >
        <AnalysisCreator
          targetDepartment={selectedDepartment}
          departmentName={currentDepartment?.name || 'All Departments'}
        />
        <AnalysisList
          analyses={filteredAnalyses}
          showDepartmentLabels={!selectedDepartment}
          departments={departmentsArray || []}
        />
      </AppShell.Main>
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <WebSocketProvider>
        <AppContent />
      </WebSocketProvider>
    </ThemeProvider>
  );
}
