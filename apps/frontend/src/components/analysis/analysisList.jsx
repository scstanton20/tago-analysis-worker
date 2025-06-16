// frontend/src/components/analysis/analysisList.jsx
import { useState } from 'react';
import { useWebSocket } from '../../contexts/websocketContext';
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
} from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';

export default function AnalysisList({
  analyses = null, // Accept filtered analyses as prop
  showDepartmentLabels = false,
  departments = [],
}) {
  const { analyses: allAnalyses = [], connectionStatus } = useWebSocket();
  const [openLogIds, setOpenLogIds] = useState(new Set());

  // Use provided analyses (filtered) or fall back to all analyses
  const analysesToShow =
    analyses !== null ? Object.values(analyses) : allAnalyses;

  const toggleAllLogs = () => {
    if (openLogIds.size === analysesToShow.length) {
      setOpenLogIds(new Set());
    } else {
      setOpenLogIds(new Set(analysesToShow.map((analysis) => analysis.name)));
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

  // Helper function to get department info
  const getDepartmentInfo = (departmentId) => {
    const department = departments.find((d) => d.id === departmentId);
    return department || { name: 'Uncategorized', color: '#9ca3af' };
  };

  if (connectionStatus === 'connecting') {
    return (
      <Paper p="lg" withBorder radius="md">
        <Stack>
          <Text size="lg" fw={600}>
            Available Analyses
          </Text>
          <Center py="xl">
            <Group>
              <Text c="dimmed">Connecting to server...</Text>
              <Loader size="sm" />
            </Group>
          </Center>
        </Stack>
      </Paper>
    );
  }

  const hasAnalyses =
    Array.isArray(analysesToShow) && analysesToShow.length > 0;

  return (
    <Paper p="lg" withBorder radius="md">
      <Stack>
        <Group justify="space-between" mb="md">
          <Box>
            <Text size="lg" fw={600}>
              Available Analyses
            </Text>
            {hasAnalyses && (
              <Text size="sm" c="dimmed" mt={4}>
                Showing {analysesToShow.length} analysis
                {analysesToShow.length !== 1 ? 'es' : ''}
              </Text>
            )}
          </Box>
          {hasAnalyses && (
            <Button
              onClick={toggleAllLogs}
              variant="light"
              size="sm"
              leftSection={<IconFileText size={16} />}
            >
              {openLogIds.size === analysesToShow.length
                ? 'Close All Logs'
                : 'Open All Logs'}
            </Button>
          )}
        </Group>

        <Stack gap="md">
          {hasAnalyses ? (
            analysesToShow.map((analysis) => {
              const departmentInfo = getDepartmentInfo(analysis.department);

              return (
                <Stack
                  key={`${analysis.name}-${analysis.created || Date.now()}`}
                  gap="xs"
                >
                  {/* Department Label (if enabled) */}
                  {showDepartmentLabels && (
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
            <Center py="xl">
              <Stack align="center" gap="xs">
                <Text c="dimmed" size="md">
                  {analyses !== null
                    ? 'No analyses found in this department.'
                    : 'No analyses available.'}
                </Text>
                <Text c="dimmed" size="sm">
                  {analyses !== null
                    ? 'Try selecting a different department or create a new analysis.'
                    : 'Upload one to get started.'}
                </Text>
              </Stack>
            </Center>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
