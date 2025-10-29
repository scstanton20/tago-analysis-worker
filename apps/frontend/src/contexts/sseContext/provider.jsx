// frontend/src/contexts/sseContext/provider.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { SSEContext } from './context';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';
import { isDevelopment, API_URL } from '../../config/env.js';
import {
  showLoading,
  updateNotification,
  showSuccess,
  showInfo,
  showError,
} from '../../utils/notificationService.jsx';

export function SSEProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [analyses, setAnalyses] = useState({});
  const [teams, setTeams] = useState({});
  const [teamStructure, setTeamStructure] = useState({});
  const [teamStructureVersion, setTeamStructureVersion] = useState(0);
  const [loadingAnalyses, setLoadingAnalyses] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [backendStatus, setBackendStatus] = useState(null);
  const [serverShutdown, setServerShutdown] = useState(false);
  const [hasInitialData, setHasInitialData] = useState(false);
  const [dnsCache, setDnsCache] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const eventSourceRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectRef = useRef(null); // Store reconnect function to break circular dependency
  const maxReconnectAttempts = 10;
  const maxReconnectDelay = 30000;
  const mountedRef = useRef(true);
  const connectionStatusRef = useRef('connecting');
  const logSequences = useRef(new Map());
  const analysisStartTimes = useRef(new Map()); // Track when analyses start
  const analysisStartTimeouts = useRef(new Map()); // Track success notification timeouts
  const subscribedAnalyses = useRef(new Set()); // Track subscribed analyses

  const addLoadingAnalysis = useCallback((analysisName) => {
    setLoadingAnalyses((prev) => new Set([...prev, analysisName]));
  }, []);

  const removeLoadingAnalysis = useCallback((analysisName) => {
    setLoadingAnalyses((prev) => {
      const newSet = new Set(prev);
      newSet.delete(analysisName);
      return newSet;
    });
  }, []);

  const getSSEUrl = useCallback(() => {
    if (!isAuthenticated) return null;

    let baseUrl;
    if (isDevelopment && API_URL) {
      baseUrl = `${API_URL}/sse/events`;
    } else {
      const protocol =
        window.location.protocol === 'https:' ? 'https:' : 'http:';
      baseUrl = `${protocol}//${window.location.host}/api/sse/events`;
    }

    return baseUrl;
  }, [isAuthenticated]);

  // Function to request status update from server via HTTP
  const requestStatusUpdate = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await fetch('/api/status', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setBackendStatus(data);
      }
    } catch (error) {
      logger.error('Error requesting status update:', error);
    }
  }, [isAuthenticated]);

  const getTeam = useCallback(
    (teamId) => {
      return teams[teamId] || null;
    },
    [teams],
  );

  // Message Handlers - extracted for better dependency tracking
  const handleInitMessage = useCallback((data) => {
    // Capture sessionId from init message
    if (data.sessionId) {
      setSessionId(data.sessionId);
      logger.log('SSE session ID received:', data.sessionId);
    }

    // Handle analyses - always store as object
    let analysesObj = {};
    if (data.analyses) {
      if (Array.isArray(data.analyses)) {
        data.analyses.forEach((analysis) => {
          analysesObj[analysis.name] = analysis;
        });
      } else {
        analysesObj = data.analyses;
      }
    }

    let teamsObj = {};
    if (data.teams) {
      if (Array.isArray(data.teams)) {
        data.teams.forEach((team) => {
          teamsObj[team.id] = team;
        });
      } else {
        teamsObj = data.teams;
      }
    }

    setAnalyses(analysesObj);
    setTeams(teamsObj);
    setTeamStructure(data.teamStructure || {});
    setHasInitialData(true);

    // Initialize log sequences tracking
    Object.keys(analysesObj).forEach((analysisName) => {
      if (!logSequences.current.has(analysisName)) {
        logSequences.current.set(analysisName, new Set());
      }
    });

    const analysisNames = new Set(Object.keys(analysesObj));
    setLoadingAnalyses((prev) => {
      const updatedLoadingSet = new Set();
      prev.forEach((loadingName) => {
        if (!analysisNames.has(loadingName)) {
          updatedLoadingSet.add(loadingName);
        }
      });
      return updatedLoadingSet;
    });
  }, []);

  const handleStatusUpdate = useCallback((data) => {
    if (data.container_health) {
      setBackendStatus(data);
    } else if (data.data) {
      setBackendStatus(data.data);
    }
  }, []);

  const handleAnalysisUpdate = useCallback((data) => {
    if (data.analysisName && data.update) {
      setAnalyses((prev) => ({
        ...prev,
        [data.analysisName]: {
          ...prev[data.analysisName],
          ...data.update,
        },
      }));

      // When analysis starts
      if (data.update.status === 'running') {
        const startTime = Date.now();
        analysisStartTimes.current.set(data.analysisName, startTime);

        // Show "Starting..." notification
        const notifId = `${data.analysisName}-starting`;
        showLoading(`${data.analysisName}`, notifId, 'Starting...');

        // Schedule success notification after 1 second
        const timeoutId = setTimeout(async () => {
          const currentStartTime = analysisStartTimes.current.get(
            data.analysisName,
          );
          if (currentStartTime === startTime) {
            // Still running - show success
            const { IconCheck } = await import('@tabler/icons-react');
            updateNotification(`${data.analysisName}-starting`, {
              title: 'Started',
              message: `${data.analysisName} is running`,
              color: 'green',
              icon: <IconCheck size={16} />,
              loading: false,
              autoClose: 3000,
            });
            analysisStartTimes.current.delete(data.analysisName);
            analysisStartTimeouts.current.delete(data.analysisName);
          }
        }, 1000);

        analysisStartTimeouts.current.set(data.analysisName, timeoutId);
      }

      // When analysis stops (any exit code)
      if (
        data.update.status === 'stopped' &&
        data.update.exitCode !== undefined
      ) {
        const startTime = analysisStartTimes.current.get(data.analysisName);
        if (startTime) {
          const runDuration = Date.now() - startTime;

          // IMMEDIATELY delete start time and clear timeout to prevent success notification
          analysisStartTimes.current.delete(data.analysisName);

          const timeoutId = analysisStartTimeouts.current.get(
            data.analysisName,
          );
          if (timeoutId) {
            clearTimeout(timeoutId);
            analysisStartTimeouts.current.delete(data.analysisName);
          }

          if (runDuration <= 1000) {
            // Exited within 1 second - this is always a failure for listeners
            // (they should stay running continuously)
            // Small delay to ensure the "Starting..." notification was created
            setTimeout(async () => {
              const exitCode = data.update.exitCode;
              const { IconX } = await import('@tabler/icons-react');

              updateNotification(`${data.analysisName}-starting`, {
                title: 'Failed to Start',
                message: `${data.analysisName} exited with code ${exitCode} after ${runDuration}ms`,
                color: 'red',
                icon: <IconX size={16} />,
                loading: false,
                autoClose: 5000,
              });
            }, 50); // 50ms delay to ensure notification was created
          }
        }
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    // Refresh data via SSE instead of page reload
    logger.log(
      'Received refresh event - data will be updated via other SSE events',
    );
  }, []);

  const handleAnalysisCreated = useCallback((data) => {
    if (data.data?.analysis) {
      logSequences.current.set(data.data.analysis, new Set());

      if (data.data.analysisData) {
        const newAnalysis = {
          ...data.data.analysisData,
          name: data.data.analysis,
          teamId: data.data.teamId || data.data.department || 'uncategorized',
        };

        setAnalyses((prev) => ({
          ...prev,
          [data.data.analysis]: newAnalysis,
        }));
      } else {
        logger.error(
          'SSE: Analysis created but no analysis data received',
          data.data,
        );
      }
    }
  }, []);

  const handleAnalysisDeleted = useCallback(
    (data) => {
      if (data.data?.fileName) {
        removeLoadingAnalysis(data.data.fileName);
        logSequences.current.delete(data.data.fileName);
        setAnalyses((prev) => {
          const newAnalyses = { ...prev };
          delete newAnalyses[data.data.fileName];
          return newAnalyses;
        });
      }
    },
    [removeLoadingAnalysis],
  );

  const handleAnalysisRenamed = useCallback((data) => {
    if (data.data?.oldFileName && data.data?.newFileName) {
      const oldSequences = logSequences.current.get(data.data.oldFileName);
      if (oldSequences) {
        logSequences.current.set(data.data.newFileName, oldSequences);
        logSequences.current.delete(data.data.oldFileName);
      }

      setAnalyses((prev) => {
        const newAnalyses = { ...prev };
        const analysis = newAnalyses[data.data.oldFileName];
        if (analysis) {
          newAnalyses[data.data.newFileName] = {
            ...analysis,
            name: data.data.newFileName,
            status: data.data.restarted ? 'running' : analysis.status,
            enabled: data.data.restarted ? true : analysis.enabled,
            teamId:
              data.data.teamId ||
              data.data.department ||
              analysis.teamId ||
              analysis.department,
          };
          delete newAnalyses[data.data.oldFileName];
        }
        return newAnalyses;
      });
    }
  }, []);

  const handleAnalysisStatus = useCallback(
    (data) => {
      if (data.data?.fileName) {
        removeLoadingAnalysis(data.data.fileName);
        setAnalyses((prev) => ({
          ...prev,
          [data.data.fileName]: {
            ...prev[data.data.fileName],
            status: data.data.status,
            enabled: data.data.enabled,
            teamId:
              data.data.teamId ||
              data.data.department ||
              prev[data.data.fileName]?.teamId ||
              prev[data.data.fileName]?.department,
            lastRun: data.data.lastRun || prev[data.data.fileName]?.lastRun,
            startTime:
              data.data.startTime || prev[data.data.fileName]?.startTime,
          },
        }));
      }
    },
    [removeLoadingAnalysis],
  );

  const handleAnalysisUpdated = useCallback(
    (data) => {
      if (data.data?.fileName) {
        setAnalyses((prev) => ({
          ...prev,
          [data.data.fileName]: {
            ...prev[data.data.fileName],
            status: data.data.status || prev[data.data.fileName]?.status,
            teamId:
              data.data.teamId ||
              data.data.department ||
              prev[data.data.fileName]?.teamId ||
              prev[data.data.fileName]?.department,
            lastRun: data.data.lastRun || prev[data.data.fileName]?.lastRun,
            startTime:
              data.data.startTime || prev[data.data.fileName]?.startTime,
          },
        }));
        if (data.data.status !== 'running') {
          removeLoadingAnalysis(data.data.fileName);
        }
      }
    },
    [removeLoadingAnalysis],
  );

  const handleAnalysisEnvironmentUpdated = useCallback((data) => {
    if (data.data?.fileName) {
      setAnalyses((prev) => ({
        ...prev,
        [data.data.fileName]: {
          ...prev[data.data.fileName],
          status: data.data.status || prev[data.data.fileName]?.status,
          teamId:
            data.data.teamId ||
            data.data.department ||
            prev[data.data.fileName]?.teamId ||
            prev[data.data.fileName]?.department,
          lastRun: data.data.lastRun || prev[data.data.fileName]?.lastRun,
          startTime: data.data.startTime || prev[data.data.fileName]?.startTime,
        },
      }));
    }
  }, []);

  const handleTeamCreatedOrUpdated = useCallback((data) => {
    if (data.team) {
      setTeams((prev) => ({
        ...prev,
        [data.team.id]: data.team,
      }));
    }
  }, []);

  const handleTeamDeleted = useCallback((data) => {
    if (data.deleted) {
      logger.log('SSE: Team deleted:', data);
      setTeams((prev) => {
        const newTeams = { ...prev };
        delete newTeams[data.deleted];
        return newTeams;
      });

      // Always update analyses when a team is deleted
      setAnalyses((prev) => {
        const newAnalyses = {};
        Object.entries(prev).forEach(([name, analysis]) => {
          if (analysis.teamId === data.deleted) {
            // Move analyses from deleted team to target team
            const targetTeamId = data.analysesMovedTo || 'uncategorized';
            logger.log(
              `SSE: Moving analysis ${name} from deleted team ${data.deleted} to ${targetTeamId}`,
            );
            newAnalyses[name] = { ...analysis, teamId: targetTeamId };
          } else {
            newAnalyses[name] = analysis;
          }
        });
        return newAnalyses;
      });
    }
  }, []);

  const handleAnalysisMovedToTeam = useCallback((data) => {
    if (data.analysis && data.to) {
      setAnalyses((prev) => ({
        ...prev,
        [data.analysis]: {
          ...prev[data.analysis],
          teamId: data.to,
        },
      }));
    }
  }, []);

  const handleTeamsReordered = useCallback((data) => {
    if (data.teams) {
      let teamsObj = {};
      if (Array.isArray(data.teams)) {
        data.teams.forEach((team) => {
          teamsObj[team.id] = team;
        });
      } else {
        teamsObj = data.teams;
      }
      setTeams(teamsObj);
    }
  }, []);

  const handleTeamStructureUpdated = useCallback((data) => {
    if (data.teamId && data.items) {
      setTeamStructure((prev) => ({
        ...prev,
        [data.teamId]: { items: data.items },
      }));
      setTeamStructureVersion((v) => v + 1);
    }
  }, []);

  const handleUserTeamsUpdated = useCallback((data) => {
    // Show notification to user about team changes
    if (data.data?.showNotification && data.data?.message) {
      showInfo(data.data.message, 'Team Access Updated', 5000);
    }

    // When user's team assignments change, trigger auth refresh
    logger.log('SSE: User teams updated, triggering permissions refresh...');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('auth-change'));
    }, 1000); // Small delay to let notification show
  }, []);

  const handleUserRemoved = useCallback(() => {
    // When user is removed from organization, log them out
    logger.log('SSE: User account removed, logging out...');
    window.location.href = '/login';
  }, []);

  const handleUserRoleUpdated = useCallback((data) => {
    // Show notification to user about role changes
    if (data.data?.showNotification && data.data?.message) {
      showSuccess(data.data.message, 'Role Updated', 5000);
    }

    // When user's role changes, trigger auth refresh
    logger.log('SSE: User role updated, triggering permissions refresh...');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('auth-change'));
    }, 1000); // Small delay to let notification show
  }, []);

  const handleAdminUserRoleUpdated = useCallback((data) => {
    // This event is sent to all admins when any user's role is updated
    // Dispatch custom event for user management modal to refresh
    logger.log('SSE: Admin notification - user role updated:', data.data);
    window.dispatchEvent(
      new CustomEvent('admin-user-role-updated', {
        detail: data.data,
      }),
    );
  }, []);

  const handleLog = useCallback((data) => {
    if (data.data?.fileName && data.data?.log) {
      const { fileName, log, totalCount } = data.data;

      // Check for duplicate using sequence number
      const sequences = logSequences.current.get(fileName) || new Set();
      if (log.sequence && sequences.has(log.sequence)) {
        return;
      }

      // Add sequence to tracking
      if (log.sequence) {
        sequences.add(log.sequence);
        logSequences.current.set(fileName, sequences);
      }

      setAnalyses((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          logs: [log, ...(prev[fileName]?.logs || [])].slice(0, 1000),
          totalLogCount: totalCount,
        },
      }));
    }
  }, []);

  const handleLogsCleared = useCallback((data) => {
    if (data.data?.fileName) {
      const fileName = data.data.fileName;
      logger.log(`Clearing logs for ${fileName}`);

      logSequences.current.set(fileName, new Set());

      // If clearMessage is provided, show it as the only log entry
      const clearedLogs = data.data.clearMessage
        ? [data.data.clearMessage]
        : [];

      setAnalyses((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          logs: clearedLogs,
          totalLogCount: clearedLogs.length,
        },
      }));
    }
  }, []);

  const handleAnalysisRolledBack = useCallback((data) => {
    if (data.data?.fileName) {
      const { fileName, version, restarted, ...analysisData } = data.data;

      // Clear log sequences for fresh start
      logSequences.current.set(fileName, new Set());

      // Update analysis with rollback information
      setAnalyses((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          ...analysisData,
          logs: [], // Clear logs since they were cleared during rollback
          totalLogCount: 0,
          currentVersion: version,
        },
      }));

      logger.log(
        `Analysis ${fileName} rolled back to version ${version}${restarted ? ' and restarted' : ''}`,
      );
    }
  }, []);

  const handleSessionInvalidated = useCallback((data) => {
    logger.log('Session invalidated:', data.reason);

    if (data.reason?.includes('Server is shutting down')) {
      setServerShutdown(true);
      setConnectionStatus('server_shutdown');
      return;
    }

    // Show notification about session revocation
    showError(
      data.reason ||
        'Your session has been revoked by an administrator. You will be logged out.',
      'Session Revoked',
    );

    // Redirect to login after showing notification
    setTimeout(() => {
      logger.log('SSE: Session invalidated, redirecting to login...');
      window.location.href = '/login';
    }, 2500);
  }, []);

  const handleUserLogout = useCallback((data) => {
    logger.log('User logout event received via SSE, data:', data);
    // Dispatch custom event for AuthProvider to handle
    const customEvent = new CustomEvent('sse-user-logout', {
      detail: { type: 'user-logout', userId: data.userId },
    });
    logger.log('Dispatching sse-user-logout event:', customEvent.detail);
    window.dispatchEvent(customEvent);
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

  // Create message handlers lookup object
  const messageHandlers = useMemo(
    () => ({
      init: handleInitMessage,
      statusUpdate: handleStatusUpdate,
      analysisUpdate: handleAnalysisUpdate,
      refresh: handleRefresh,
      analysisCreated: handleAnalysisCreated,
      analysisDeleted: handleAnalysisDeleted,
      analysisRenamed: handleAnalysisRenamed,
      analysisStatus: handleAnalysisStatus,
      analysisUpdated: handleAnalysisUpdated,
      analysisEnvironmentUpdated: handleAnalysisEnvironmentUpdated,
      teamCreated: handleTeamCreatedOrUpdated,
      teamUpdated: handleTeamCreatedOrUpdated,
      teamDeleted: handleTeamDeleted,
      analysisMovedToTeam: handleAnalysisMovedToTeam,
      teamsReordered: handleTeamsReordered,
      folderCreated: () => {}, // Structure updates handled by teamStructureUpdated
      folderUpdated: () => {},
      folderDeleted: () => {},
      teamStructureUpdated: handleTeamStructureUpdated,
      userTeamsUpdated: handleUserTeamsUpdated,
      userRemoved: handleUserRemoved,
      userRoleUpdated: handleUserRoleUpdated,
      adminUserRoleUpdated: handleAdminUserRoleUpdated,
      log: handleLog,
      logsCleared: handleLogsCleared,
      analysisRolledBack: handleAnalysisRolledBack,
      sessionInvalidated: handleSessionInvalidated,
      userLogout: handleUserLogout,
      dnsConfigUpdated: handleDnsConfigUpdated,
      dnsCacheCleared: handleDnsStatsUpdate,
      dnsStatsReset: handleDnsStatsUpdate,
      metricsUpdate: handleMetricsUpdate,
    }),
    [
      handleInitMessage,
      handleStatusUpdate,
      handleAnalysisUpdate,
      handleRefresh,
      handleAnalysisCreated,
      handleAnalysisDeleted,
      handleAnalysisRenamed,
      handleAnalysisStatus,
      handleAnalysisUpdated,
      handleAnalysisEnvironmentUpdated,
      handleTeamCreatedOrUpdated,
      handleTeamDeleted,
      handleAnalysisMovedToTeam,
      handleTeamsReordered,
      handleTeamStructureUpdated,
      handleUserTeamsUpdated,
      handleUserRemoved,
      handleUserRoleUpdated,
      handleAdminUserRoleUpdated,
      handleLog,
      handleLogsCleared,
      handleAnalysisRolledBack,
      handleSessionInvalidated,
      handleUserLogout,
      handleDnsConfigUpdated,
      handleDnsStatsUpdate,
      handleMetricsUpdate,
    ],
  );

  const handleMessage = useCallback(
    (event) => {
      if (!mountedRef.current) return;

      try {
        const data = JSON.parse(event.data);

        // Skip heartbeat messages
        if (data.type === 'heartbeat' || data.type === 'connection') {
          return;
        }

        const handler = messageHandlers[data.type];
        if (handler) {
          handler(data);
        } else {
          logger.log('Unhandled SSE message type:', data.type);
        }
      } catch (error) {
        logger.error('Error handling SSE message:', error);
      }
    },
    [messageHandlers],
  );

  // Define createConnection before reconnect to avoid circular dependency issues
  const createConnection = useCallback(async () => {
    const sseUrl = getSSEUrl();

    if (!sseUrl) {
      throw new Error('Authentication required for SSE connection');
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(sseUrl, {
        withCredentials: true,
      });

      eventSourceRef.current = eventSource;

      const connectionTimeout = setTimeout(() => {
        logger.log('SSE connection timeout');
        eventSource.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      eventSource.onopen = () => {
        clearTimeout(connectionTimeout);
        logger.log('SSE connection established');

        if (mountedRef.current) {
          setConnectionStatus('connected');
          connectionStatusRef.current = 'connected';
          reconnectAttemptsRef.current = 0;
        }

        resolve(eventSource);
      };

      eventSource.onerror = (error) => {
        clearTimeout(connectionTimeout);
        logger.error('SSE connection error', error);

        if (mountedRef.current) {
          if (eventSource.readyState === EventSource.CLOSED) {
            setConnectionStatus('disconnected');
            connectionStatusRef.current = 'disconnected';
            setBackendStatus(null);
            // Use ref to avoid circular dependency
            if (reconnectRef.current) {
              reconnectRef.current();
            }
          }
        }

        if (eventSource.readyState === EventSource.CLOSED) {
          reject(error);
        }
      };

      eventSource.onmessage = handleMessage;
    });
  }, [handleMessage, getSSEUrl]);

  const reconnect = useCallback(async () => {
    if (!mountedRef.current) return;

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      logger.log(
        `SSE max reconnection attempts reached (${maxReconnectAttempts})`,
      );
      setConnectionStatus('failed');
      connectionStatusRef.current = 'failed';
      return;
    }

    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttemptsRef.current),
      maxReconnectDelay,
    );
    reconnectAttemptsRef.current++;

    logger.log(
      `SSE reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`,
    );

    setTimeout(async () => {
      if (!mountedRef.current) return;

      setConnectionStatus('connecting');
      connectionStatusRef.current = 'connecting';
      try {
        await createConnection();
      } catch (error) {
        logger.error('SSE reconnection failed:', error);
        if (mountedRef.current) {
          setConnectionStatus('disconnected');
          connectionStatusRef.current = 'disconnected';
          // Use ref to avoid circular dependency
          if (reconnectRef.current) {
            reconnectRef.current();
          }
        }
      }
    }, delay);
  }, [createConnection]);

  // Store reconnect in ref to break circular dependency
  reconnectRef.current = reconnect;

  useEffect(() => {
    mountedRef.current = true;

    // Capture ref values for cleanup function
    const timeoutsMap = analysisStartTimeouts.current;

    const connect = async () => {
      if (!isAuthenticated) {
        setConnectionStatus('disconnected');
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        return;
      }

      try {
        setConnectionStatus('connecting');
        connectionStatusRef.current = 'connecting';
        logger.log('Starting SSE connection...');

        await createConnection();
      } catch (error) {
        logger.error('SSE initial connection failed:', error);
        if (mountedRef.current) {
          setConnectionStatus('disconnected');
          connectionStatusRef.current = 'disconnected';
          // Use ref to avoid issues during initialization
          if (reconnectRef.current) {
            reconnectRef.current();
          }
        }
      }
    };

    // Handle page visibility changes for automatic reconnection
    const handleVisibilityChange = async () => {
      if (!document.hidden && mountedRef.current) {
        if (
          connectionStatusRef.current === 'disconnected' ||
          !eventSourceRef.current ||
          eventSourceRef.current.readyState !== EventSource.OPEN
        ) {
          logger.log('Page became visible, attempting SSE reconnection...');
          connect();
        }
      }
    };

    const handleFocus = async () => {
      if (mountedRef.current) {
        if (
          connectionStatusRef.current === 'disconnected' ||
          !eventSourceRef.current ||
          eventSourceRef.current.readyState !== EventSource.OPEN
        ) {
          logger.log('Window gained focus, attempting SSE reconnection...');
          connect();
        }
      }
    };

    const timeoutId = setTimeout(connect, 50);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      logger.log('SSE client cleanup starting');
      mountedRef.current = false;

      clearTimeout(timeoutId);

      // Clear all pending analysis start timeouts to prevent memory leaks
      timeoutsMap.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutsMap.clear();

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);

      if (eventSourceRef.current) {
        logger.log('SSE closing connection');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [createConnection, reconnect, isAuthenticated, serverShutdown]);

  // Subscribe to analysis channels for log streaming
  const subscribeToAnalysis = useCallback(
    async (analysisNames) => {
      if (!sessionId || !isAuthenticated) {
        logger.warn('Cannot subscribe: No session ID or not authenticated');
        return { success: false, error: 'Not connected' };
      }

      if (!Array.isArray(analysisNames) || analysisNames.length === 0) {
        logger.warn('Cannot subscribe: Invalid analysisNames');
        return { success: false, error: 'Invalid analysis names' };
      }

      try {
        const response = await fetch('/api/sse/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            sessionId,
            analyses: analysisNames,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          logger.error('Subscribe failed:', error);
          return { success: false, error: error.error || 'Subscribe failed' };
        }

        const result = await response.json();
        logger.log('Subscribed to analyses:', result);

        // Track subscriptions locally
        result.subscribed?.forEach((name) => {
          subscribedAnalyses.current.add(name);
        });

        return result;
      } catch (error) {
        logger.error('Error subscribing to analyses:', error);
        return { success: false, error: error.message };
      }
    },
    [sessionId, isAuthenticated],
  );

  // Unsubscribe from analysis channels
  const unsubscribeFromAnalysis = useCallback(
    async (analysisNames) => {
      if (!sessionId || !isAuthenticated) {
        logger.warn('Cannot unsubscribe: No session ID or not authenticated');
        return { success: false, error: 'Not connected' };
      }

      if (!Array.isArray(analysisNames) || analysisNames.length === 0) {
        logger.warn('Cannot unsubscribe: Invalid analysisNames');
        return { success: false, error: 'Invalid analysis names' };
      }

      try {
        const response = await fetch('/api/sse/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            sessionId,
            analyses: analysisNames,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          logger.error('Unsubscribe failed:', error);
          return { success: false, error: error.error || 'Unsubscribe failed' };
        }

        const result = await response.json();
        logger.log('Unsubscribed from analyses:', result);

        // Remove from local tracking
        result.unsubscribed?.forEach((name) => {
          subscribedAnalyses.current.delete(name);
        });

        return result;
      } catch (error) {
        logger.error('Error unsubscribing from analyses:', error);
        return { success: false, error: error.message };
      }
    },
    [sessionId, isAuthenticated],
  );

  // Request status updates periodically (fallback)
  useEffect(() => {
    if (connectionStatus === 'connected') {
      requestStatusUpdate();

      const interval = setInterval(requestStatusUpdate, 60000);

      return () => clearInterval(interval);
    }
  }, [connectionStatus, requestStatusUpdate]);

  const value = useMemo(
    () => ({
      analyses,
      teams,
      teamStructure,
      teamStructureVersion,
      loadingAnalyses,
      addLoadingAnalysis,
      removeLoadingAnalysis,
      connectionStatus,
      backendStatus,
      requestStatusUpdate,
      getTeam,
      hasInitialData,
      serverShutdown,
      dnsCache,
      metricsData,
      sessionId,
      subscribeToAnalysis,
      unsubscribeFromAnalysis,
    }),
    [
      analyses,
      teams,
      teamStructure,
      teamStructureVersion,
      loadingAnalyses,
      addLoadingAnalysis,
      removeLoadingAnalysis,
      connectionStatus,
      backendStatus,
      requestStatusUpdate,
      getTeam,
      hasInitialData,
      serverShutdown,
      dnsCache,
      metricsData,
      sessionId,
      subscribeToAnalysis,
      unsubscribeFromAnalysis,
    ],
  );

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

SSEProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
