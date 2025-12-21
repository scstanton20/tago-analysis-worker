import PropTypes from 'prop-types';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { useConnection } from '../../contexts/sseContext';
import { analysisService } from '../../services/analysisService';
import logger from '../../utils/logger';
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
} from '@mantine/core';
import { EmptyState, UtilityButton } from '../global';

const LOGS_PER_PAGE = 100;

const AnalysisLogs = ({ analysis }) => {
  const { subscribeToAnalysis, unsubscribeFromAnalysis, sessionId } =
    useConnection();
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
  // Refs to track latest log state for deduplication without deps
  const currentLogsRef = useRef({
    sseLogs: [],
    initialLogs: [],
    additionalLogs: [],
  });
  // Ref to track previous log count for clearing detection
  const previousLogCountRef = useRef(0);
  // Ref to track the last logsClearedAt timestamp we've processed
  const lastClearedAtRef = useRef(null);

  // analysis.logs is always an array (guaranteed by SSEAnalysesProvider)
  const sseLogs = analysis.logs;
  const totalLogCount = analysis.totalLogCount || sseLogs.length;

  // Auto-scroll hook for managing scroll behavior
  const { handleScrollPositionChange, disableAutoScroll } = useAutoScroll({
    scrollRef,
    items: sseLogs,
    hasLoadedInitial: hasLoadedInitial.current,
  });

  const loadInitialLogs = useCallback(async () => {
    if (hasLoadedInitial.current) return;

    setIsLoading(true);
    try {
      const response = await analysisService.getLogs(analysis.id, {
        page: 1,
        limit: LOGS_PER_PAGE,
      });

      if (response.logs) {
        setInitialLogs(response.logs);
        setHasMore(response.hasMore || false);
      }
      hasLoadedInitial.current = true;
    } catch (error) {
      logger.error('Failed to fetch initial logs:', error);
      {
        setHasMore(false);
      }
    } finally {
      {
        setIsLoading(false);
      }
    }
  }, [analysis.id]);

  // Subscribe to analysis log channel when component mounts
  useEffect(() => {
    if (!sessionId || !analysis.id) {
      return;
    }

    subscribeToAnalysis([analysis.id]);

    return () => {
      unsubscribeFromAnalysis([analysis.id]);
    };
  }, [analysis.id, sessionId, subscribeToAnalysis, unsubscribeFromAnalysis]);

  // Keep currentLogsRef in sync with latest log state
  // This allows loadMoreLogs to access current values without including them in deps
  useEffect(() => {
    currentLogsRef.current = { sseLogs, initialLogs, additionalLogs };
  }, [sseLogs, initialLogs, additionalLogs]);

  // Load initial logs on mount or analysis change
  useEffect(() => {
    hasLoadedInitial.current = false;
    setInitialLogs([]);
    setAdditionalLogs([]);
    setPage(1);
    setHasMore(false);
    previousLogCountRef.current = 0; // Reset log count tracker
    disableAutoScroll(); // Start with auto-scroll disabled
    loadInitialLogs();
  }, [analysis.id, disableAutoScroll, loadInitialLogs]);

  const loadMoreLogs = useCallback(async () => {
    if (isLoadingMore.current || !hasMore) return;

    isLoadingMore.current = true;

    try {
      const nextPage = page + 1;
      const response = await analysisService.getLogs(analysis.id, {
        page: nextPage,
        limit: LOGS_PER_PAGE,
      });

      // Use refs to get current log values without including them in deps
      // This prevents unnecessary callback recreations when logs update
      const {
        sseLogs: currentSseLogs,
        initialLogs: currentInitialLogs,
        additionalLogs: currentAdditionalLogs,
      } = currentLogsRef.current;

      // Filter out logs we already have
      const existingSequences = new Set(
        [
          ...currentSseLogs.map((log) => log.sequence),
          ...currentInitialLogs.map((log) => log.sequence),
          ...currentAdditionalLogs.map((log) => log.sequence),
        ].filter(Boolean),
      );

      const newLogs =
        response.logs?.filter((log) => !existingSequences.has(log.sequence)) ||
        [];

      if (newLogs.length > 0) {
        setAdditionalLogs((prev) => [...prev, ...newLogs]);
      }

      {
        setHasMore(response.hasMore);
        setPage(nextPage);
      }
    } catch (error) {
      logger.error('Failed to fetch more logs:', error);
    } finally {
      isLoadingMore.current = false;
    }
  }, [analysis.id, page, hasMore]);

  const handleBottomReached = useCallback(() => {
    // Only load more if we're not already loading and there are more logs
    if (!isLoadingMore.current && hasMore) {
      logger.log('Bottom reached - triggering loadMoreLogs');
      loadMoreLogs();
    }
  }, [hasMore, loadMoreLogs]);

  // Handle log clearing via explicit SSE signal (logsClearedAt timestamp)
  // This is more reliable than detecting clearing from log content
  useEffect(() => {
    const clearedAt = analysis.logsClearedAt;
    if (clearedAt && clearedAt !== lastClearedAtRef.current) {
      logger.log('Logs cleared via SSE, resetting local state');
      setInitialLogs([]);
      setAdditionalLogs([]);
      setPage(1);
      setHasMore(false);
      previousLogCountRef.current = 0;
      disableAutoScroll();
      lastClearedAtRef.current = clearedAt;
      // Don't reload initial logs - the SSE already provides the clear message
      // and there's nothing else in the log file
    }
    // disableAutoScroll is a stable callback, safe to include
  }, [analysis.logsClearedAt, disableAutoScroll]);

  // Memoize combined logs to prevent unnecessary recalculations
  // Using useMemo instead of useCallback since we call this every render
  const logs = useMemo(() => {
    return [...sseLogs, ...initialLogs, ...additionalLogs]
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
  }, [sseLogs, initialLogs, additionalLogs]);

  // Store active event listeners to ensure cleanup on unmount
  const activeListenersRef = useRef({ onMouseMove: null, onMouseUp: null });

  // Cleanup effect to remove event listeners on unmount
  useEffect(() => {
    return () => {
      // Remove any active event listeners when component unmounts
      const { onMouseMove, onMouseUp } = activeListenersRef.current;
      if (onMouseMove) {
        document.removeEventListener('mousemove', onMouseMove);
      }
      if (onMouseUp) {
        document.removeEventListener('mouseup', onMouseUp);
      }
    };
  }, []);

  // Memoized resize handler with proper cleanup
  const handleMouseDown = useCallback(
    (e) => {
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
        // Clear refs after cleanup
        activeListenersRef.current = { onMouseMove: null, onMouseUp: null };
      }

      // Store references for potential cleanup on unmount
      activeListenersRef.current = { onMouseMove, onMouseUp };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [height],
  );

  if (!analysis || !analysis.id) {
    return null;
  }

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
            Logs {sseLogs.length > 0 && '(Live)'}
          </Text>
          <Group gap="xs">
            {(isLoading || isLoadingMore.current) && <Loader size="xs" />}
            <Group gap="xs" align="center">
              <Text size="xs" c="dimmed" component="span">
                {sseLogs.length > 0
                  ? `${logs.length} of ${totalLogCount} entries`
                  : `${logs.length} entries`}
              </Text>
              {sseLogs.length > 0 &&
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
      <ScrollArea
        h={height}
        p="sm"
        viewportRef={scrollRef}
        onScrollPositionChange={handleScrollPositionChange}
        onBottomReached={handleBottomReached}
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
                  <UtilityButton size="xs" onClick={loadMoreLogs}>
                    Load more logs...
                  </UtilityButton>
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
        onMouseDown={handleMouseDown}
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
