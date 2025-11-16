import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { BackendContext } from './contexts/BackendContext.js';

// Metrics come every 1 second - if we miss 3+ updates, backend is offline
const METRICS_STALE_THRESHOLD_MS = 3500;

export function SSEBackendProvider({ children }) {
  const [backendStatus, setBackendStatus] = useState(null);
  const [dnsCache, setDnsCache] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const lastMetricsUpdateRef = useRef(null);
  const stalenessCheckIntervalRef = useRef(null);
  const offlineDetectedRef = useRef(false); // Track if we've already detected offline

  // Event Handlers
  const handleStatusUpdate = useCallback((data) => {
    // Handle both SSE event format and HTTP fetch format
    if (data.container_health) {
      // Direct SSE event: { type: 'statusUpdate', container_health: {...}, ... }
      setBackendStatus(data);
    } else if (data.data?.container_health) {
      // Wrapped format from HTTP: { type: 'statusUpdate', data: { container_health: {...} } }
      setBackendStatus(data.data);
    } else if (data.data) {
      // Fallback: just use data.data
      setBackendStatus(data.data);
    }
  }, []);

  const handleDnsConfigUpdated = useCallback((data) => {
    if (data.data) {
      setDnsCache(data.data);
    }
  }, []);

  const handleDnsStatsUpdate = useCallback((data) => {
    if (data.data) {
      setDnsCache((prev) => ({
        ...(prev || {}),
        stats: data.data.stats,
      }));
    }
  }, []);

  const handleMetricsUpdate = useCallback((data) => {
    if (data.total || data.container || data.children || data.processes) {
      // Track when we last received a metrics update
      lastMetricsUpdateRef.current = Date.now();

      // Reset offline detection flag when we receive metrics
      offlineDetectedRef.current = false;

      setMetricsData({
        total: data.total,
        container: data.container,
        children: data.children,
        processes: data.processes,
        timestamp: data.timestamp,
      });

      // Extract and update backend status from consolidated metricsUpdate
      if (data.container_health && data.tagoConnection) {
        setBackendStatus({
          container_health: data.container_health,
          tagoConnection: data.tagoConnection,
          serverTime: data.timestamp,
        });
      }

      // Extract and update DNS stats from metricsUpdate (new unified approach)
      if (data.dns) {
        setDnsCache((prev) => ({
          ...(prev || {}),
          stats: data.dns,
        }));
      }
    }
  }, []);

  // Handle connection loss - clear stale backend status
  // This fires when EventSource natively detects connection closed
  const handleConnectionLost = useCallback(() => {
    setBackendStatus(null);
    setMetricsData(null);
    lastMetricsUpdateRef.current = null;
    // Don't reset offlineDetectedRef here - let metricsUpdate reset it when data flows again
  }, []);

  // Set up staleness detection - check every second if metrics are stale
  // Run once on mount, no dependencies to prevent re-creating interval
  useEffect(() => {
    console.log('[SSEBackend] Setting up staleness detection interval');
    stalenessCheckIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const lastUpdate = lastMetricsUpdateRef.current;

      // Only check if we have a last update time and haven't already detected offline
      if (lastUpdate && !offlineDetectedRef.current) {
        const timeSinceLastUpdate = now - lastUpdate;

        if (timeSinceLastUpdate > METRICS_STALE_THRESHOLD_MS) {
          console.warn(
            `Backend metrics stale - last update ${Math.round(timeSinceLastUpdate / 1000)}s ago. Backend is offline.`,
          );

          // Mark as offline to prevent repeated triggers
          offlineDetectedRef.current = true;

          // Clear stale data
          setBackendStatus(null);
          setMetricsData(null);

          // Emit event ONCE to trigger SSE reconnection
          window.dispatchEvent(new CustomEvent('backend-offline'));
        }
      }
    }, 1000);

    return () => {
      if (stalenessCheckIntervalRef.current) {
        clearInterval(stalenessCheckIntervalRef.current);
        stalenessCheckIntervalRef.current = null;
      }
    };
  }, []); // Empty deps - run once on mount

  // Message handler to be called by parent
  const handleMessage = useCallback(
    (data) => {
      switch (data.type) {
        case 'statusUpdate':
          handleStatusUpdate(data);
          break;
        case 'dnsConfigUpdated':
          handleDnsConfigUpdated(data);
          break;
        case 'dnsCacheCleared':
        case 'dnsStatsReset':
          handleDnsStatsUpdate(data);
          break;
        case 'metricsUpdate':
          handleMetricsUpdate(data);
          break;
        case 'connectionLost':
          handleConnectionLost();
          break;
        default:
          break;
      }
    },
    [
      handleStatusUpdate,
      handleDnsConfigUpdated,
      handleDnsStatsUpdate,
      handleMetricsUpdate,
      handleConnectionLost,
    ],
  );

  const value = useMemo(
    () => ({
      backendStatus,
      dnsCache,
      metricsData,
      handleMessage,
    }),
    [backendStatus, dnsCache, metricsData, handleMessage],
  );

  return (
    <BackendContext.Provider value={value}>{children}</BackendContext.Provider>
  );
}

SSEBackendProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
