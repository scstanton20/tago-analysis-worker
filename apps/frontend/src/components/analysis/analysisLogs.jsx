// frontend/src/components/analysis/analysisLogs.jsx
import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { analysisService } from '../../services/analysisService';
import {
  Paper,
  ScrollArea,
  Group,
  Text,
  Badge,
  Stack,
  Button,
  Center,
  Loader,
  Box,
} from '@mantine/core';

const LOGS_PER_PAGE = 100;

const AnalysisLogs = ({ analysis }) => {
  const [height, setHeight] = useState(384);
  const [isResizing, setIsResizing] = useState(false);
  const [initialLogs, setInitialLogs] = useState([]);
  const [additionalLogs, setAdditionalLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef(null);
  const isLoadingMore = useRef(false);
  const hasLoadedInitial = useRef(false);
  const lastScrollTop = useRef(0);
  const shouldAutoScroll = useRef(true);

  // Use logs directly from props
  const websocketLogs = analysis.logs || [];
  const totalLogCount = analysis.totalLogCount || websocketLogs.length;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (
      shouldAutoScroll.current &&
      scrollRef.current &&
      websocketLogs.length > 0
    ) {
      const element = scrollRef.current;
      setTimeout(() => {
        element.scrollTop = element.scrollHeight;
      }, 0);
    }
  }, [websocketLogs.length]);

  const loadInitialLogs = async () => {
    if (hasLoadedInitial.current) return;

    setIsLoading(true);
    try {
      const response = await analysisService.getLogs(analysis.name, {
        page: 1,
        limit: LOGS_PER_PAGE,
      });

      if (response.logs) {
        setInitialLogs(response.logs);
        setHasMore(response.hasMore || false);
      }
      hasLoadedInitial.current = true;
    } catch (error) {
      console.error('Failed to fetch initial logs:', error);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreLogs = async () => {
    if (isLoadingMore.current || !hasMore) return;

    isLoadingMore.current = true;

    try {
      const nextPage = page + 1;
      const response = await analysisService.getLogs(analysis.name, {
        page: nextPage,
        limit: LOGS_PER_PAGE,
      });

      // Filter out logs we already have
      const existingSequences = new Set(
        [
          ...websocketLogs.map((log) => log.sequence),
          ...initialLogs.map((log) => log.sequence),
          ...additionalLogs.map((log) => log.sequence),
        ].filter(Boolean),
      );

      const newLogs =
        response.logs?.filter((log) => !existingSequences.has(log.sequence)) ||
        [];

      if (newLogs.length > 0) {
        setAdditionalLogs((prev) => [...prev, ...newLogs]);
      }

      setHasMore(response.hasMore);
      setPage(nextPage);
    } catch (error) {
      console.error('Failed to fetch more logs:', error);
    } finally {
      isLoadingMore.current = false;
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Check if user scrolled up manually
    if (scrollTop < lastScrollTop.current) {
      shouldAutoScroll.current = false;
    }

    // Re-enable auto-scroll if user scrolls to bottom
    if (scrollHeight - (scrollTop + clientHeight) < 50) {
      shouldAutoScroll.current = true;
    }

    lastScrollTop.current = scrollTop;

    // Load more when scrolled near bottom
    if (
      !isLoadingMore.current &&
      hasMore &&
      scrollHeight - (scrollTop + clientHeight) < 200
    ) {
      loadMoreLogs();
    }
  };

  // Load initial logs on mount
  useEffect(() => {
    hasLoadedInitial.current = false;
    setInitialLogs([]);
    setAdditionalLogs([]);
    setPage(1);
    setHasMore(false);
    shouldAutoScroll.current = true;
    loadInitialLogs();
  }, [analysis.name]);

  // Reset when logs are cleared
  useEffect(() => {
    if (websocketLogs.length === 0 && hasLoadedInitial.current) {
      setInitialLogs([]);
      setAdditionalLogs([]);
      setPage(1);
      setHasMore(false);
      shouldAutoScroll.current = true;
    }
  }, [websocketLogs.length]);

  // Combine and deduplicate all logs
  const allLogs = [...websocketLogs, ...initialLogs, ...additionalLogs]
    .filter(
      (log, index, self) =>
        index ===
        self.findIndex((l) =>
          l.sequence
            ? l.sequence === log.sequence
            : l.timestamp === log.timestamp && l.message === log.message,
        ),
    )
    .sort((a, b) => {
      if (a.sequence && b.sequence) return b.sequence - a.sequence;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

  return (
    <Paper
      mt="md"
      withBorder
      radius="md"
      style={{
        minHeight: '96px',
        maxHeight: '800px',
        overflow: 'hidden',
        userSelect: isResizing ? 'none' : 'auto',
      }}
    >
      {/* Header */}
      <Box p="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            Logs
          </Text>
          <Group gap="xs">
            {(isLoading || isLoadingMore.current) && <Loader size="xs" />}
            <Text size="xs" c="dimmed">
              {websocketLogs.length > 0 ? (
                <>
                  {allLogs.length} of {totalLogCount} entries
                  {analysis.status === 'running' ? (
                    <Badge color="green" size="xs" variant="dot" ml="xs">
                      Live
                    </Badge>
                  ) : (
                    <Badge color="red" size="xs" variant="dot" ml="xs">
                      Stopped
                    </Badge>
                  )}
                </>
              ) : (
                `${allLogs.length} entries`
              )}
            </Text>
          </Group>
        </Group>
      </Box>

      {/* Logs Content */}
      <ScrollArea
        h={height}
        p="sm"
        ref={scrollRef}
        onScrollPositionChange={handleScroll}
        type="scroll"
        scrollbarSize={8}
      >
        {isLoading && allLogs.length === 0 ? (
          <Center h="100%">
            <Group>
              <Loader size="sm" />
              <Text c="dimmed" size="sm">
                Loading logs...
              </Text>
            </Group>
          </Center>
        ) : allLogs.length === 0 ? (
          <Center h="100%">
            <Text c="dimmed" size="sm">
              No logs available.
            </Text>
          </Center>
        ) : (
          <Stack gap={2}>
            {allLogs.map((log, index) => {
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
                  style={(theme) => ({
                    borderRadius: theme.radius.sm,
                    '&:hover': {
                      backgroundColor:
                        theme.colorScheme === 'dark'
                          ? theme.colors.dark[6]
                          : theme.colors.gray[0],
                    },
                  })}
                >
                  <Text
                    size="xs"
                    c="dimmed"
                    ff="monospace"
                    style={{ flexShrink: 0 }}
                  >
                    {log.timestamp}
                  </Text>
                  <Text
                    size="xs"
                    c={isError ? 'red' : isWarning ? 'yellow' : undefined}
                    ff="monospace"
                    style={{ wordBreak: 'break-word' }}
                  >
                    {log.message}
                  </Text>
                </Group>
              );
            })}

            {hasMore && !isLoading && (
              <Center py="sm">
                {isLoadingMore.current ? (
                  <Group>
                    <Loader size="xs" />
                    <Text size="xs" c="dimmed">
                      Loading more...
                    </Text>
                  </Group>
                ) : (
                  <Button variant="subtle" size="xs" onClick={loadMoreLogs}>
                    Load more logs...
                  </Button>
                )}
              </Center>
            )}
          </Stack>
        )}
      </ScrollArea>

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
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startHeight = height;
          setIsResizing(true);

          function onMouseMove(moveEvent) {
            const delta = moveEvent.clientY - startY;
            const newHeight = Math.max(96, Math.min(800, startHeight + delta));
            setHeight(newHeight);
          }

          function onMouseUp() {
            setIsResizing(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          }

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      >
        <Box w={64} h={2} bg="gray.3" style={{ borderRadius: '2px' }} />
      </Box>
    </Paper>
  );
};

AnalysisLogs.propTypes = {
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
    status: PropTypes.string,
    logs: PropTypes.arrayOf(
      PropTypes.shape({
        sequence: PropTypes.number,
        timestamp: PropTypes.string,
        message: PropTypes.string,
      }),
    ),
    totalLogCount: PropTypes.number,
  }).isRequired,
};

export default AnalysisLogs;
