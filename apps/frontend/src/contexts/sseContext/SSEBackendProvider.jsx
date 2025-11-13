import { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { BackendContext } from './contexts/BackendContext.js';

export function SSEBackendProvider({ children }) {
  const [backendStatus, setBackendStatus] = useState(null);
  const [dnsCache, setDnsCache] = useState(null);
  const [metricsData, setMetricsData] = useState(null);

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
        default:
          break;
      }
    },
    [
      handleStatusUpdate,
      handleDnsConfigUpdated,
      handleDnsStatsUpdate,
      handleMetricsUpdate,
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
