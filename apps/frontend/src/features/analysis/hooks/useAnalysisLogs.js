/**
 * Comprehensive hook for managing analysis logs
 * Handles SSE subscription, initial loading, pagination, and clearing
 *
 * @module features/analysis/hooks/useAnalysisLogs
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useConnection } from '@/contexts/sseContext/hooks/useConnection';
import logger from '@/utils/logger';
import { filterNewLogs as workerFilterNewLogs } from '@/workers/sseWorkerClient';
import { analysisService } from '../api/analysisService';

const LOGS_PER_PAGE = 100;

/**
 * Manages all aspects of analysis log display:
 * - SSE subscription with restart-aware resubscription
 * - Initial log loading from API
 * - Pagination (load more)
 * - Log clearing detection
 * - Deduplication and sorting
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.analysis - Analysis object from SSE context
 * @param {Function} [params.onRestart] - Optional callback when analysis restarts
 * @returns {Object} Log state and controls
 */
export function useAnalysisLogs({ analysis, onRestart }) {
  const { sessionId, subscribeToAnalysis, unsubscribeFromAnalysis } =
    useConnection();

  // Local state for API-fetched logs
  const [initialLogs, setInitialLogs] = useState([]);
  const [additionalLogs, setAdditionalLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Refs for avoiding stale closures and tracking state
  const hasLoadedInitial = useRef(false);
  const previousLogCountRef = useRef(0);
  const lastClearedAtRef = useRef(null);
  const prevStatusRef = useRef(analysis.status);

  // Ref to track latest log state for deduplication without deps
  const currentLogsRef = useRef({
    sseLogs: [],
    initialLogs: [],
    additionalLogs: [],
  });

  // SSE logs from context (always an array)
  const sseLogs = analysis.logs;
  const totalLogCount = analysis.totalLogCount || sseLogs.length;

  // Keep currentLogsRef in sync with latest log state
  useEffect(() => {
    currentLogsRef.current = { sseLogs, initialLogs, additionalLogs };
  }, [sseLogs, initialLogs, additionalLogs]);

  // Load initial logs from API
  const loadInitialLogs = useCallback(async () => {
    try {
      const response = await analysisService.getLogs(analysis.id, {
        page: 1,
        limit: LOGS_PER_PAGE,
      });

      if (response.logs && response.logs.length > 0) {
        setInitialLogs(response.logs);
        setHasMore(response.hasMore);
        hasLoadedInitial.current = true;
        previousLogCountRef.current = response.logs.length;
      } else {
        setHasMore(false);
      }
    } catch (error) {
      logger.error('Failed to fetch initial logs:', error);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [analysis.id]);

  // Load more logs (pagination)
  const loadMoreLogs = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    try {
      const nextPage = page + 1;
      const response = await analysisService.getLogs(analysis.id, {
        page: nextPage,
        limit: LOGS_PER_PAGE,
      });

      // Use refs to get current log values without stale closures
      const {
        sseLogs: currentSseLogs,
        initialLogs: currentInitialLogs,
        additionalLogs: currentAdditionalLogs,
      } = currentLogsRef.current;

      // Collect existing sequences for filtering
      const existingSequences = [
        ...currentSseLogs.map((log) => log.sequence),
        ...currentInitialLogs.map((log) => log.sequence),
        ...currentAdditionalLogs.map((log) => log.sequence),
      ].filter(Boolean);

      // Filter out duplicates using worker (off main thread)
      const result = await workerFilterNewLogs(
        response.logs || [],
        existingSequences,
      );
      const newLogs = result.logs || [];

      if (newLogs.length > 0) {
        setAdditionalLogs((prev) => [...prev, ...newLogs]);
      }

      setHasMore(response.hasMore);
      setPage(nextPage);
    } catch (error) {
      logger.error('Failed to fetch more logs:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [analysis.id, page, hasMore, isLoadingMore]);

  // Reset state helper
  const resetLogState = useCallback(() => {
    hasLoadedInitial.current = false;
    setInitialLogs([]);
    setAdditionalLogs([]);
    setPage(1);
    setHasMore(false);
    previousLogCountRef.current = 0;
  }, []);

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

  // Resubscribe when analysis restarts (status changes to 'running')
  useEffect(() => {
    const wasNotRunning = prevStatusRef.current !== 'running';
    const isNowRunning = analysis.status === 'running';

    // Update ref for next comparison
    prevStatusRef.current = analysis.status;

    // If analysis just started running, force resubscription for fresh logs
    if (wasNotRunning && isNowRunning && sessionId && analysis.id) {
      logger.log('Analysis restarted, resubscribing for fresh logs');

      // Call optional restart callback (e.g., to enable auto-scroll)
      onRestart?.();

      // Unsubscribe and resubscribe to ensure clean channel state
      unsubscribeFromAnalysis([analysis.id]).then(() => {
        subscribeToAnalysis([analysis.id]);
      });
    }
  }, [
    analysis.status,
    analysis.id,
    sessionId,
    subscribeToAnalysis,
    unsubscribeFromAnalysis,
    onRestart,
  ]);

  // Load initial logs on mount or analysis change
  useEffect(() => {
    resetLogState();
    loadInitialLogs();
  }, [analysis.id, resetLogState, loadInitialLogs]);

  // Handle log clearing via SSE signal (logsClearedAt timestamp)
  useEffect(() => {
    const clearedAt = analysis.logsClearedAt;
    if (clearedAt && clearedAt !== lastClearedAtRef.current) {
      logger.log('Logs cleared via SSE, resetting local state');
      resetLogState();
      lastClearedAtRef.current = clearedAt;
      // Don't reload - SSE already provides the clear message
    }
  }, [analysis.logsClearedAt, resetLogState]);

  // Combined, deduplicated, sorted logs
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

  return {
    logs,
    isLoading,
    isLoadingMore,
    hasMore,
    totalLogCount,
    loadMoreLogs,
  };
}
