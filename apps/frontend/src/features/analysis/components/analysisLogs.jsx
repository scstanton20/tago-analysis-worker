import { useRef, useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Paper,
  ScrollArea,
  Group,
  Text,
  Badge,
  Stack,
  Center,
  Loader,
  Box,
  ActionIcon,
  Transition,
} from '@mantine/core';
import { IconChevronUp } from '@tabler/icons-react';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useResizableHeight } from '@/hooks/useResizableHeight';
import { EmptyState } from '@/components/global';
import { useAnalysisLogs } from '../hooks/useAnalysisLogs';

const AnalysisLogs = ({ analysis }) => {
  const scrollRef = useRef(null);

  // Resizable height with drag handle
  const { height, isResizing, handleResizeStart } = useResizableHeight({
    initialHeight: 384,
    minHeight: 96,
    maxHeight: 800,
  });

  // Comprehensive logs hook - handles subscription, loading, pagination, clearing
  const {
    logs,
    isLoading,
    isLoadingMore,
    hasMore,
    totalLogCount,
    loadMoreLogs,
  } = useAnalysisLogs({
    analysis,
    onRestart: () => {
      // Jump to top when analysis restarts
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    },
  });

  // Auto-scroll with scroll-away detection and position preservation
  // Pass SSE log count (not total) so scroll only adjusts for TOP content changes
  const { handleScrollPositionChange, isScrolledAway, scrollToTop } =
    useAutoScroll({
      scrollRef,
      topItemCount: analysis.logs.length, // SSE logs only, not paginated
      scrollAwayThreshold: 100,
    });

  // Intersection observer for reliable infinite scroll
  const sentinelRef = useRef(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  // Set up IntersectionObserver after mount (when refs are available)
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollContainer = scrollRef.current;

    if (!sentinel || !scrollContainer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setIsIntersecting(entries[0]?.isIntersecting ?? false);
      },
      {
        root: scrollContainer,
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]); // Re-create observer when hasMore changes (sentinel may appear/disappear)

  // Trigger load when sentinel becomes visible
  useEffect(() => {
    if (isIntersecting && hasMore && !isLoadingMore) {
      loadMoreLogs();
    }
  }, [isIntersecting, hasMore, isLoadingMore, loadMoreLogs]);

  // Callback ref for sentinel to support dynamic mounting
  const setSentinelRef = useCallback((node) => {
    sentinelRef.current = node;
  }, []);

  if (!analysis || !analysis.id) {
    return null;
  }

  const sseLogs = analysis.logs;
  const isLive = sseLogs.length > 0;

  return (
    <Paper
      mt="md"
      withBorder
      radius="md"
      onClick={(e) => e.stopPropagation()}
      style={{
        minHeight: '96px',
        maxHeight: '800px',
        overflow: 'hidden',
        userSelect: isResizing ? 'none' : 'auto',
        cursor: 'default',
      }}
    >
      {/* Header */}
      <Box p="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            Logs {isLive && '(Live)'}
          </Text>
          <Group gap="xs">
            {isLoading && <Loader size="xs" />}
            <Group gap="xs" align="center">
              <Text size="xs" c="dimmed" component="span">
                {isLive
                  ? `${logs.length} of ${totalLogCount} entries`
                  : `${logs.length} entries`}
              </Text>
              {isLive &&
                (analysis.status === 'running' ? (
                  <Badge color="green" size="xs" variant="dot">
                    Live
                  </Badge>
                ) : (
                  <Badge color="red" size="xs" variant="dot">
                    Stopped
                  </Badge>
                ))}
            </Group>
          </Group>
        </Group>
      </Box>

      {/* Logs Content */}
      <Box pos="relative">
        {/* Scroll to Top Button */}
        <Transition mounted={isScrolledAway} transition="fade" duration={200}>
          {(styles) => (
            <ActionIcon
              style={{
                ...styles,
                position: 'absolute',
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
              }}
              variant="filled"
              color="gray"
              size="md"
              radius="xl"
              onClick={scrollToTop}
              aria-label="Scroll to live logs"
            >
              <IconChevronUp size={18} />
            </ActionIcon>
          )}
        </Transition>

        <ScrollArea
          h={height}
          p="sm"
          viewportRef={scrollRef}
          onScrollPositionChange={handleScrollPositionChange}
          type="scroll"
          scrollbarSize={8}
        >
          {isLoading && logs.length === 0 ? (
            <Center h="100%">
              <Group>
                <Loader size="sm" />
                <Text c="dimmed" size="sm">
                  Loading logs...
                </Text>
              </Group>
            </Center>
          ) : logs.length === 0 ? (
            <EmptyState
              title="No logs available"
              description={
                analysis.status === 'running'
                  ? 'Waiting for new logs...'
                  : undefined
              }
              py="xl"
            />
          ) : (
            <Stack gap={2}>
              {logs.map((log, index) => {
                const isError = log.message?.toLowerCase().includes('error');
                const isWarning = log.message?.toLowerCase().includes('warn');

                return (
                  <Group
                    key={
                      log.sequence
                        ? `seq-${log.sequence}`
                        : `${log.timestamp}-${index}`
                    }
                    gap="xs"
                    wrap="nowrap"
                    p={4}
                    styles={{
                      root: {
                        borderRadius: 'var(--mantine-radius-sm)',
                        '&:hover': {
                          backgroundColor: 'var(--mantine-color-gray-light)',
                        },
                      },
                    }}
                  >
                    <Text
                      size="xs"
                      c="dimmed"
                      ff="monospace"
                      style={{ flexShrink: 0 }}
                      component="span"
                    >
                      {log.timestamp}
                    </Text>
                    <Text
                      size="xs"
                      c={isError ? 'red' : isWarning ? 'yellow' : undefined}
                      ff="monospace"
                      style={{ wordBreak: 'break-word' }}
                      component="span"
                    >
                      {log.message}
                    </Text>
                  </Group>
                );
              })}

              {/* Intersection observer sentinel for infinite scroll */}
              {hasMore && (
                <Center ref={setSentinelRef} py="sm">
                  {isLoadingMore ? (
                    <Group gap="xs">
                      <Loader size="xs" />
                      <Text size="xs" c="dimmed">
                        Loading more...
                      </Text>
                    </Group>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Scroll to load more
                    </Text>
                  )}
                </Center>
              )}
            </Stack>
          )}
        </ScrollArea>
      </Box>

      {/* Resize Handle */}
      <Box
        h={8}
        style={{
          cursor: 'row-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 200ms',
          '&:hover': {
            backgroundColor: 'var(--mantine-color-gray-2)',
          },
          backgroundColor: isResizing
            ? 'var(--mantine-color-gray-3)'
            : undefined,
        }}
        onMouseDown={handleResizeStart}
      >
        <Box w={64} h={2} bg="gray.3" style={{ borderRadius: '2px' }} />
      </Box>
    </Paper>
  );
};

AnalysisLogs.propTypes = {
  analysis: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    status: PropTypes.string,
    logs: PropTypes.arrayOf(
      PropTypes.shape({
        sequence: PropTypes.number,
        timestamp: PropTypes.string,
        message: PropTypes.string,
      }),
    ),
    totalLogCount: PropTypes.number,
    logsClearedAt: PropTypes.number,
  }).isRequired,
};

export default AnalysisLogs;
