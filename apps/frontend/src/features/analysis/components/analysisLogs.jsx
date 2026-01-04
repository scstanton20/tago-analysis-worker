import PropTypes from 'prop-types';
import { Paper, Text, Stack, Box, ActionIcon, Transition } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { LazyLog, ScrollFollow } from '@melloware/react-logviewer';
import { LoadingState } from '@/components/global';
import { useAnalysisLogs } from '../hooks/useAnalysisLogs';

/**
 * Analysis Logs Component
 * Displays logs using LazyLog with SSE integration
 *
 * Behavior:
 * - When analysis is STOPPED: fetch historical logs from API
 * - When analysis is RUNNING: show live SSE logs only (no initial fetch)
 * - User can scroll up to pause auto-follow, scroll to bottom to resume
 * - When logs are cleared via SSE, component remounts via logsClearedAt key
 */
const AnalysisLogs = ({ analysis }) => {
  const {
    lazyLogRef,
    containerRef,
    isFollowing,
    isLoading,
    handleScroll,
    scrollToBottom,
    logsClearedAt,
  } = useAnalysisLogs(analysis);

  if (!analysis || !analysis.id) {
    return null;
  }

  const showScrollToBottom = !isFollowing;

  return (
    <Paper mt="md" withBorder radius="md" p="md">
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          Logs
        </Text>

        {/* Show skeleton while loading, keep LazyLog mounted (hidden) for ref */}
        {isLoading && (
          <LoadingState loading skeleton pattern="logs" skeletonCount={10} />
        )}

        <Box
          ref={containerRef}
          style={{
            display: isLoading ? 'none' : 'block',
            position: 'relative',
          }}
        >
          <ScrollFollow
            key={logsClearedAt || 'initial'}
            startFollowing
            render={({ onScroll }) => (
              <LazyLog
                ref={lazyLogRef}
                external
                caseInsensitive
                enableHotKeys
                wraplines
                enableLineNumbers={false}
                enableSearchNavigation={false}
                extraLines={1}
                follow={isFollowing}
                onScroll={(args) => {
                  handleScroll(args);
                  onScroll(args);
                }}
                height="520"
                selectableLines
              />
            )}
          />

          {/* Floating scroll to bottom button */}
          <Transition
            mounted={showScrollToBottom}
            transition="slide-up"
            duration={200}
          >
            {(styles) => (
              <ActionIcon
                style={{
                  ...styles,
                  position: 'absolute',
                  bottom: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                }}
                variant="filled"
                color="brand"
                size="lg"
                radius="xl"
                onClick={scrollToBottom}
                aria-label="Scroll to bottom"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
            )}
          </Transition>
        </Box>
      </Stack>
    </Paper>
  );
};

AnalysisLogs.propTypes = {
  analysis: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    logs: PropTypes.array,
    logsClearedAt: PropTypes.string,
    status: PropTypes.string,
  }).isRequired,
};

export default AnalysisLogs;
