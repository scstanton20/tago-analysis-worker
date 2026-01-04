import { useRef, useEffect, useCallback, useState } from 'react';
import { useConnection } from '@/contexts/sseContext/hooks/useConnection';
import { useAnalyses } from '@/contexts/sseContext/hooks/useAnalyses';
import { logEventBus } from '@/utils/logEventBus';
import { analysisService } from '../api/analysisService';

/**
 * Format a log entry for LazyLog display
 * @param {Object} log - Log object with timestamp and message
 * @returns {string} Formatted log line "[HH:MM:SS] message"
 */
function formatLogEntry(log) {
  if (!log) return '';

  const timestamp = log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return timestamp ? `[${timestamp}] ${log.message}` : log.message;
}

/**
 * Hook for managing analysis logs with LazyLog integration
 *
 * Behavior:
 * - When analysis is STOPPED: fetches historical logs from API on mount
 * - When analysis is RUNNING: shows live SSE logs only (no initial fetch)
 * - User can scroll up to pause auto-follow, scroll to bottom to resume
 * - When logs are cleared via SSE, returns new logsClearedAt to trigger remount
 *
 * @param {Object} analysis - Analysis object with id and status
 * @returns {Object} Log management state and handlers
 */
export function useAnalysisLogs(analysis) {
  const lazyLogRef = useRef(null);
  const containerRef = useRef(null);
  const initialLoadDoneRef = useRef(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const {
    connectionStatus,
    sessionId,
    subscribeToAnalysis,
    unsubscribeFromAnalysis,
  } = useConnection();
  const { analyses } = useAnalyses();

  const isSSEConnected = connectionStatus === 'connected' && sessionId;
  const isRunning = analysis?.status === 'running';
  const analysisId = analysis?.id;

  const logsClearedAt = analyses?.[analysisId]?.logsClearedAt;

  // Subscribe to analysis logs when SSE is connected
  useEffect(() => {
    if (!isSSEConnected || !analysisId) return;

    subscribeToAnalysis([analysisId]);

    return () => {
      unsubscribeFromAnalysis([analysisId]);
    };
  }, [
    analysisId,
    isSSEConnected,
    subscribeToAnalysis,
    unsubscribeFromAnalysis,
  ]);

  // Subscribe to log event bus for real-time logs
  useEffect(() => {
    if (!analysisId) return;

    const unsubscribe = logEventBus.subscribe(analysisId, (log) => {
      // Handle clear event (from logEventBus.clear())
      if (log._cleared) {
        // Component will remount via logsClearedAt key change
        return;
      }

      // Skip if LazyLog ref not ready yet
      if (!lazyLogRef.current) return;

      const formatted = formatLogEntry(log);
      lazyLogRef.current.appendLines([formatted]);
    });

    return unsubscribe;
  }, [analysisId]);

  // Load historical logs - only when analysis is stopped
  const loadHistoricalLogs = useCallback(async () => {
    if (!lazyLogRef.current || initialLoadDoneRef.current) return;
    if (isRunning) {
      // Don't fetch historical logs when running - SSE will provide live logs
      initialLoadDoneRef.current = true;
      return;
    }

    setIsLoading(true);
    try {
      const text = await analysisService.getLogs(analysisId);
      if (text && text.trim()) {
        const lines = text.split('\n');
        lazyLogRef.current.appendLines(lines);
      }
      initialLoadDoneRef.current = true;
    } catch (error) {
      console.error('Failed to load historical logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [analysisId, isRunning]);

  // Load historical logs when SSE connects (only if stopped)
  useEffect(() => {
    if (isSSEConnected) {
      loadHistoricalLogs();
    }
  }, [isSSEConnected, loadHistoricalLogs]);

  // Reset state when analysis changes or logs are cleared
  useEffect(() => {
    initialLoadDoneRef.current = false;
  }, [analysisId, logsClearedAt]);

  // Force LazyLog to recalculate viewport when analysis status changes
  // This fixes the issue where logs disappear visually when stopping
  useEffect(() => {
    if (!containerRef.current) return;

    const frameId = requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });

    return () => cancelAnimationFrame(frameId);
  }, [isRunning]);

  // Handle scroll - detect when user scrolls away from bottom
  const handleScroll = useCallback(
    ({ scrollTop, scrollHeight, clientHeight }) => {
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsFollowing(isAtBottom);
    },
    [],
  );

  // Scroll to bottom and resume following
  const scrollToBottom = useCallback(() => {
    setIsFollowing(true);
  }, []);

  return {
    lazyLogRef,
    containerRef,
    isFollowing,
    isLoading,
    handleScroll,
    scrollToBottom,
    logsClearedAt,
  };
}

export default useAnalysisLogs;
