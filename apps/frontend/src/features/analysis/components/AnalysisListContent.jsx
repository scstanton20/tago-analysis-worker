import PropTypes from 'prop-types';
import { Stack, Group, Text, Center, Box } from '@mantine/core';
import { IconFileText, IconUserX } from '@tabler/icons-react';
import { FormAlert, EmptyState } from '@/components/global';
import AnalysisTree from './analysisTree';
import AnalysisItem from './analysisItem';

/**
 * Content section of the AnalysisList component.
 * Renders the appropriate view based on team access, selected team, and analyses availability.
 */
export default function AnalysisListContent({
  hasNoTeamAccess,
  selectedTeam,
  currentTeamInfo,
  hasAnalyses,
  analysesArray,
  showTeamLabels,
  getTeamInfo,
  totalAccessibleAnalyses,
  reorderMode,
  localStructure,
  teamStructure,
  teamStructureVersion,
  allAnalyses,
  onFolderAction,
  onPendingReorder,
}) {
  if (hasNoTeamAccess) {
    return (
      <Stack gap="md">
        <Center py="xl">
          <Stack align="center" gap="md">
            <FormAlert
              type="warning"
              icon={<IconUserX size={20} />}
              title="No Team Access"
              message="You haven't been assigned to any teams yet. Please contact an administrator to request access to the teams you need."
              style={{ maxWidth: 500 }}
            />
          </Stack>
        </Center>
      </Stack>
    );
  }

  if (selectedTeam) {
    return (
      <Stack gap="md">
        <AnalysisTree
          key={`tree-${selectedTeam}-${reorderMode ? 'reorder' : teamStructureVersion}`}
          teamId={selectedTeam}
          teamStructure={
            reorderMode && localStructure ? localStructure : teamStructure
          }
          analyses={allAnalyses}
          onFolderAction={onFolderAction}
          reorderMode={reorderMode}
          onPendingReorder={onPendingReorder}
        />
      </Stack>
    );
  }

  if (hasAnalyses) {
    return (
      <Stack gap="md">
        {analysesArray.map((analysis) => {
          const teamInfo = getTeamInfo(analysis.teamId);

          return (
            <Stack key={`analysis-${analysis.id}`} gap="xs">
              {showTeamLabels && (
                <Group gap="xs">
                  <Box
                    w={12}
                    h={12}
                    style={{
                      borderRadius: '50%',
                      backgroundColor: teamInfo.color,
                    }}
                  />
                  <Text size="sm" c="dimmed" fw={500}>
                    {teamInfo.name}
                  </Text>
                </Group>
              )}
              <AnalysisItem
                analysis={analysis}
                teamInfo={showTeamLabels ? teamInfo : null}
              />
            </Stack>
          );
        })}
      </Stack>
    );
  }

  // Empty state
  const emptyTitle = selectedTeam
    ? 'No analyses found in this team'
    : totalAccessibleAnalyses === 0
      ? 'No analyses available'
      : 'Loading analyses...';

  const emptyDescription = selectedTeam
    ? 'Try selecting a different team or create a new analysis here.'
    : totalAccessibleAnalyses === 0
      ? 'Upload an analysis file to get started.'
      : 'Please wait while analyses load from the server.';

  return (
    <Stack gap="md">
      <EmptyState
        icon={<IconFileText size={48} />}
        title={emptyTitle}
        description={emptyDescription}
      >
        {selectedTeam && currentTeamInfo && (
          <FormAlert
            type="info"
            message={
              <>
                You can create a new analysis for the{' '}
                <strong>{currentTeamInfo.name}</strong> team using the analysis
                creator above.
              </>
            }
          />
        )}
      </EmptyState>
    </Stack>
  );
}

AnalysisListContent.propTypes = {
  hasNoTeamAccess: PropTypes.bool.isRequired,
  selectedTeam: PropTypes.string,
  currentTeamInfo: PropTypes.object,
  hasAnalyses: PropTypes.bool.isRequired,
  analysesArray: PropTypes.array.isRequired,
  showTeamLabels: PropTypes.bool.isRequired,
  getTeamInfo: PropTypes.func.isRequired,
  totalAccessibleAnalyses: PropTypes.number.isRequired,
  reorderMode: PropTypes.bool.isRequired,
  localStructure: PropTypes.object,
  teamStructure: PropTypes.object,
  teamStructureVersion: PropTypes.number,
  allAnalyses: PropTypes.object,
  onFolderAction: PropTypes.func.isRequired,
  onPendingReorder: PropTypes.func.isRequired,
};
