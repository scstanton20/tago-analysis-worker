import PropTypes from 'prop-types';
import { Group, Text, Box, ActionIcon, Tooltip } from '@mantine/core';
import {
  IconFolderPlus,
  IconArrowsSort,
  IconCheck,
  IconX,
  IconPlus,
} from '@tabler/icons-react';
import { ActionMenu } from '@/components/global/menus/ActionMenu';
import {
  SecondaryButton,
  CancelButton,
  SuccessButton,
} from '@/components/global';

export default function AnalysisListHeader({
  selectedTeam,
  currentTeamInfo,
  hasAnalyses,
  analysesCount,
  canUploadAnalyses,
  reorderMode,
  onCreateFolder,
  onCancelReorder,
  onApplyReorders,
  onStartReorder,
  onOpenAnalysisCreator,
}) {
  return (
    <Group justify="space-between" mb="md">
      <Box>
        <Text size="lg" fw={600}>
          {selectedTeam ? 'Team Analyses' : 'All Analyses'}
        </Text>

        {/* Team info */}
        {selectedTeam && currentTeamInfo && (
          <Group gap="xs" mt={4}>
            <Box
              w={12}
              h={12}
              style={{
                borderRadius: '50%',
                backgroundColor: currentTeamInfo.color,
              }}
            />
            <Text size="sm" c="dimmed" fw={500}>
              {currentTeamInfo.name}
            </Text>
          </Group>
        )}

        {/* Count info */}
        <Text size="sm" c="dimmed" mt={4}>
          {hasAnalyses
            ? `${analysesCount} ${analysesCount === 1 ? 'analysis' : 'analyses'}${selectedTeam ? '' : ' available'}`
            : selectedTeam
              ? 'No analyses in this team'
              : 'No analyses available'}
        </Text>
      </Box>

      {/* Action buttons */}
      <Group gap="xs">
        {/* Create Analysis Button - hidden during reorder mode */}
        {canUploadAnalyses() && !reorderMode && (
          <Tooltip label="Create Analysis" position="bottom">
            <ActionIcon
              variant="gradient"
              gradient={{ from: 'brand.6', to: 'accent.6' }}
              size="lg"
              radius="md"
              onClick={onOpenAnalysisCreator}
              aria-label="Create Analysis"
            >
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        )}

        {/* Reorganize buttons - only when viewing a team with analyses */}
        {hasAnalyses &&
          selectedTeam &&
          (reorderMode ? (
            <>
              <SecondaryButton
                onClick={onCreateFolder}
                size="sm"
                leftSection={<IconFolderPlus size={16} />}
              >
                Create Folder
              </SecondaryButton>
              <CancelButton
                onClick={onCancelReorder}
                size="sm"
                leftSection={<IconX size={16} />}
              >
                Cancel
              </CancelButton>
              <SuccessButton
                onClick={onApplyReorders}
                size="sm"
                leftSection={<IconCheck size={16} />}
              >
                Done
              </SuccessButton>
            </>
          ) : (
            <ActionMenu
              items={[
                {
                  label: 'Reorganize List',
                  icon: <IconArrowsSort size={16} />,
                  onClick: onStartReorder,
                },
              ]}
              triggerVariant="light"
              triggerSize="lg"
            />
          ))}
      </Group>
    </Group>
  );
}

AnalysisListHeader.propTypes = {
  selectedTeam: PropTypes.string,
  currentTeamInfo: PropTypes.shape({
    name: PropTypes.string,
    color: PropTypes.string,
  }),
  hasAnalyses: PropTypes.bool.isRequired,
  analysesCount: PropTypes.number.isRequired,
  canUploadAnalyses: PropTypes.func.isRequired,
  reorderMode: PropTypes.bool.isRequired,
  onCreateFolder: PropTypes.func.isRequired,
  onCancelReorder: PropTypes.func.isRequired,
  onApplyReorders: PropTypes.func.isRequired,
  onStartReorder: PropTypes.func.isRequired,
  onOpenAnalysisCreator: PropTypes.func.isRequired,
};
