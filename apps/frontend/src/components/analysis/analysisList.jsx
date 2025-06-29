// frontend/src/components/analysis/analysisList.jsx
import { useState, useMemo } from 'react';
import { useSSE } from '../../contexts/sseContext';
import { usePermissions } from '../../hooks/usePermissions';
import AnalysisItem from './analysisItem';
import {
  Paper,
  Stack,
  Group,
  Text,
  Button,
  Center,
  Loader,
  Box,
  Alert,
} from '@mantine/core';
import { IconFileText, IconInfoCircle, IconUserX } from '@tabler/icons-react';

export default function AnalysisList({
  analyses = null,
  showDepartmentLabels = false,
  departments = {},
  selectedDepartment = null,
}) {
  const {
    analyses: allAnalyses = {},
    departments: allDepartments = {},
    connectionStatus,
    getDepartment,
  } = useSSE();

  const { accessibleDepartments, isAdmin } = usePermissions();

  const [openLogIds, setOpenLogIds] = useState(new Set());

  // Determine which analyses to show (memoized for performance)
  const analysesToShow = useMemo(() => {
    // If pre-filtered analyses are provided
    if (analyses !== null) {
      if (typeof analyses === 'object') {
        return analyses;
      }
    }

    // Use WebSocket data and apply department filtering
    if (selectedDepartment) {
      const filtered = {};
      Object.entries(allAnalyses).forEach(([name, analysis]) => {
        if (analysis.department === selectedDepartment) {
          filtered[name] = analysis;
        }
      });
      return filtered;
    }

    return allAnalyses;
  }, [analyses, allAnalyses, selectedDepartment]);

  // Convert to array for rendering (memoized)
  const analysesArray = useMemo(() => {
    const array = Object.values(analysesToShow).filter(
      (analysis) => analysis && analysis.name, // Ensure valid analysis objects
    );
    return array;
  }, [analysesToShow]);

  // Get departments object for lookups
  const departmentsObj =
    Object.keys(departments).length > 0 ? departments : allDepartments;

  // Helper function to get department info
  const getDepartmentInfo = (departmentId) => {
    if (!departmentId) {
      return { name: 'Uncategorized', color: '#9ca3af' };
    }

    const department = departmentsObj[departmentId];
    if (department) {
      return department;
    }

    // Fallback for missing departments
    console.warn(`Department ${departmentId} not found`);
    return { name: 'Unknown Department', color: '#ef4444' };
  };

  // Log toggle functions
  const toggleAllLogs = () => {
    if (openLogIds.size === analysesArray.length) {
      setOpenLogIds(new Set());
    } else {
      setOpenLogIds(new Set(analysesArray.map((analysis) => analysis.name)));
    }
  };

  const toggleLog = (analysisName) => {
    setOpenLogIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(analysisName)) {
        newSet.delete(analysisName);
      } else {
        newSet.add(analysisName);
      }
      return newSet;
    });
  };

  // Handle loading state
  if (connectionStatus === 'connecting') {
    return (
      <Paper p="lg" withBorder radius="md">
        <Stack>
          <Text size="lg" fw={600}>
            Available Analyses
          </Text>
          <Center py="xl">
            <Group>
              <Loader size="sm" />
              <Text c="dimmed">Connecting to server...</Text>
            </Group>
          </Center>
        </Stack>
      </Paper>
    );
  }

  // Handle disconnected state
  if (connectionStatus === 'disconnected') {
    return (
      <Paper p="lg" withBorder radius="md">
        <Stack>
          <Text size="lg" fw={600}>
            Available Analyses
          </Text>
          <Alert
            icon={<IconInfoCircle size={16} />}
            color="red"
            variant="light"
          >
            Disconnected from server. Attempting to reconnect...
          </Alert>
        </Stack>
      </Paper>
    );
  }

  const hasAnalyses = analysesArray.length > 0;
  const totalAnalyses = Object.keys(allAnalyses).length;

  // Check if user has no department access (non-admin users only)
  const hasNoDepartmentAccess =
    !isAdmin && (!accessibleDepartments || accessibleDepartments.length === 0);

  // Get current department info for display
  const currentDepartmentInfo = selectedDepartment
    ? getDepartment?.(selectedDepartment)
    : null;

  return (
    <Paper p="lg" withBorder radius="md">
      <Stack>
        {/* Header */}
        <Group justify="space-between" mb="md">
          <Box>
            <Text size="lg" fw={600}>
              {selectedDepartment ? 'Department Analyses' : 'All Analyses'}
            </Text>

            {/* Department info */}
            {selectedDepartment && currentDepartmentInfo && (
              <Group gap="xs" mt={4}>
                <Box
                  w={12}
                  h={12}
                  style={{
                    borderRadius: '50%',
                    backgroundColor: currentDepartmentInfo.color,
                  }}
                />
                <Text size="sm" c="dimmed" fw={500}>
                  {currentDepartmentInfo.name}
                </Text>
              </Group>
            )}

            {/* Count info */}
            <Text size="sm" c="dimmed" mt={4}>
              {hasAnalyses
                ? selectedDepartment
                  ? `Showing ${analysesArray.length} of ${totalAnalyses} analyses`
                  : `${analysesArray.length} analysis${analysesArray.length !== 1 ? 'es' : ''} available`
                : selectedDepartment
                  ? 'No analyses in this department'
                  : 'No analyses available'}
            </Text>
          </Box>

          {/* Log toggle button */}
          {hasAnalyses && (
            <Button
              onClick={toggleAllLogs}
              variant="light"
              size="sm"
              color="brand"
              leftSection={<IconFileText size={16} />}
            >
              {openLogIds.size === analysesArray.length
                ? 'Close All Logs'
                : 'Open All Logs'}
            </Button>
          )}
        </Group>

        {/* Content */}
        <Stack gap="md">
          {hasNoDepartmentAccess ? (
            /* No Department Access State */
            <Center py="xl">
              <Stack align="center" gap="md">
                <Alert
                  icon={<IconUserX size={20} />}
                  color="orange"
                  variant="light"
                  style={{ maxWidth: 500 }}
                >
                  <Stack gap="sm">
                    <Text fw={500}>No Department Access</Text>
                    <Text size="sm">
                      You haven't been assigned to any departments yet. Please
                      contact an administrator to request access to the
                      departments you need.
                    </Text>
                  </Stack>
                </Alert>
              </Stack>
            </Center>
          ) : hasAnalyses ? (
            analysesArray.map((analysis) => {
              const departmentInfo = getDepartmentInfo(analysis.department);

              return (
                <Stack key={`analysis-${analysis.name}`} gap="xs">
                  {/* Department Label (when showing all analyses) */}
                  {showDepartmentLabels && !selectedDepartment && (
                    <Group gap="xs">
                      <Box
                        w={12}
                        h={12}
                        style={{
                          borderRadius: '50%',
                          backgroundColor: departmentInfo.color,
                        }}
                      />
                      <Text size="sm" c="dimmed" fw={500}>
                        {departmentInfo.name}
                      </Text>
                    </Group>
                  )}

                  {/* Analysis Item */}
                  <AnalysisItem
                    analysis={analysis}
                    showLogs={openLogIds.has(analysis.name)}
                    onToggleLogs={() => toggleLog(analysis.name)}
                    departmentInfo={
                      showDepartmentLabels ? departmentInfo : null
                    }
                  />
                </Stack>
              );
            })
          ) : (
            /* Empty State */
            <Center py="xl">
              <Stack align="center" gap="md">
                <Box ta="center">
                  <Text c="dimmed" size="md" mb="xs">
                    {selectedDepartment
                      ? 'No analyses found in this department'
                      : totalAnalyses === 0
                        ? 'No analyses available'
                        : 'Loading analyses...'}
                  </Text>

                  <Text c="dimmed" size="sm">
                    {selectedDepartment
                      ? 'Try selecting a different department or create a new analysis here.'
                      : totalAnalyses === 0
                        ? 'Upload an analysis file to get started.'
                        : 'Please wait while analyses load from the server.'}
                  </Text>
                </Box>

                {/* Additional context for department view */}
                {selectedDepartment && currentDepartmentInfo && (
                  <Alert
                    icon={<IconInfoCircle size={16} />}
                    color="blue"
                    variant="light"
                    style={{ maxWidth: 400 }}
                  >
                    You can create a new analysis for the{' '}
                    <strong>{currentDepartmentInfo.name}</strong> department
                    using the analysis creator above.
                  </Alert>
                )}
              </Stack>
            </Center>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
