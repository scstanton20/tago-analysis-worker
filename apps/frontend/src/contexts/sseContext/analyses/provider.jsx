// frontend/src/contexts/sseContext/analyses/provider.jsx
import { useState, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { SSEAnalysesContext } from './context';
import logger from '../../../utils/logger';

export function SSEAnalysesProvider({ children }) {
  const [analyses, setAnalyses] = useState({});
  const [loadingAnalyses, setLoadingAnalyses] = useState(new Set());

  const logSequences = useRef(new Map());
  const analysisStartTimes = useRef(new Map());
  const analysisStartTimeouts = useRef(new Map());

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

  const getAnalysis = useCallback(
    (name) => {
      return analyses[name] || null;
    },
    [analyses],
  );

  const getAnalysisNames = useCallback(() => {
    return Object.keys(analyses);
  }, [analyses]);

  const filterAnalyses = useCallback(
    (predicate) => {
      return Object.entries(analyses)
        .filter(([, analysis]) => predicate(analysis))
        .reduce((acc, [name, analysis]) => {
          acc[name] = analysis;
          return acc;
        }, {});
    },
    [analyses],
  );

  // Event Handlers
  const handleInit = useCallback((data) => {
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

    setAnalyses(analysesObj);

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
        import('@mantine/notifications').then(({ notifications }) => {
          const notifId = `${data.analysisName}-starting`;
          notifications.show({
            id: notifId,
            title: 'Starting...',
            message: `${data.analysisName}`,
            color: 'blue',
            loading: true,
            autoClose: false,
          });
        });

        // Schedule success notification after 1 second
        const timeoutId = setTimeout(() => {
          const currentStartTime = analysisStartTimes.current.get(
            data.analysisName,
          );
          if (currentStartTime === startTime) {
            // Still running - show success
            import('@mantine/notifications').then(({ notifications }) => {
              notifications.update({
                id: `${data.analysisName}-starting`,
                title: 'Started',
                message: `${data.analysisName} is running`,
                color: 'green',
                loading: false,
                autoClose: 3000,
              });
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
            setTimeout(() => {
              import('@mantine/notifications').then(({ notifications }) => {
                const exitCode = data.update.exitCode;

                notifications.update({
                  id: `${data.analysisName}-starting`,
                  title: 'Failed to Start',
                  message: `${data.analysisName} exited with code ${exitCode} after ${runDuration}ms`,
                  color: 'red',
                  loading: false,
                  autoClose: 5000,
                });
              });
            }, 50); // 50ms delay to ensure notification was created
          }
        }
      }
    }
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

  const handleAnalysisDeleted = useCallback((data) => {
    if (data.data?.fileName) {
      const fileName = data.data.fileName;
      setLoadingAnalyses((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileName);
        return newSet;
      });
      logSequences.current.delete(fileName);
      setAnalyses((prev) => {
        const newAnalyses = { ...prev };
        delete newAnalyses[fileName];
        return newAnalyses;
      });
    }
  }, []);

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

  const handleAnalysisStatus = useCallback((data) => {
    if (data.data?.fileName) {
      const fileName = data.data.fileName;
      setLoadingAnalyses((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileName);
        return newSet;
      });
      setAnalyses((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          status: data.data.status,
          enabled: data.data.enabled,
          teamId:
            data.data.teamId ||
            data.data.department ||
            prev[fileName]?.teamId ||
            prev[fileName]?.department,
          lastRun: data.data.lastRun || prev[fileName]?.lastRun,
          startTime: data.data.startTime || prev[fileName]?.startTime,
        },
      }));
    }
  }, []);

  const handleAnalysisUpdated = useCallback((data) => {
    if (data.data?.fileName) {
      const fileName = data.data.fileName;
      setAnalyses((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          status: data.data.status || prev[fileName]?.status,
          teamId:
            data.data.teamId ||
            data.data.department ||
            prev[fileName]?.teamId ||
            prev[fileName]?.department,
          lastRun: data.data.lastRun || prev[fileName]?.lastRun,
          startTime: data.data.startTime || prev[fileName]?.startTime,
        },
      }));
      if (data.data.status !== 'running') {
        setLoadingAnalyses((prev) => {
          const newSet = new Set(prev);
          newSet.delete(fileName);
          return newSet;
        });
      }
    }
  }, []);

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

  const handleTeamDeleted = useCallback((data) => {
    if (data.deleted) {
      // Update analyses when a team is deleted
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

  // Message handler to be called by parent
  const handleMessage = useCallback(
    (data) => {
      switch (data.type) {
        case 'init':
          handleInit(data);
          break;
        case 'analysisUpdate':
          handleAnalysisUpdate(data);
          break;
        case 'analysisCreated':
          handleAnalysisCreated(data);
          break;
        case 'analysisDeleted':
          handleAnalysisDeleted(data);
          break;
        case 'analysisRenamed':
          handleAnalysisRenamed(data);
          break;
        case 'analysisStatus':
          handleAnalysisStatus(data);
          break;
        case 'analysisUpdated':
          handleAnalysisUpdated(data);
          break;
        case 'analysisEnvironmentUpdated':
          handleAnalysisEnvironmentUpdated(data);
          break;
        case 'log':
          handleLog(data);
          break;
        case 'logsCleared':
          handleLogsCleared(data);
          break;
        case 'analysisRolledBack':
          handleAnalysisRolledBack(data);
          break;
        case 'analysisMovedToTeam':
          handleAnalysisMovedToTeam(data);
          break;
        case 'teamDeleted':
          handleTeamDeleted(data);
          break;
        default:
          break;
      }
    },
    [
      handleInit,
      handleAnalysisUpdate,
      handleAnalysisCreated,
      handleAnalysisDeleted,
      handleAnalysisRenamed,
      handleAnalysisStatus,
      handleAnalysisUpdated,
      handleAnalysisEnvironmentUpdated,
      handleLog,
      handleLogsCleared,
      handleAnalysisRolledBack,
      handleAnalysisMovedToTeam,
      handleTeamDeleted,
    ],
  );

  // Cleanup effect
  const cleanup = useCallback(() => {
    // Clear all pending analysis start timeouts
    analysisStartTimeouts.current.forEach((timeoutId) =>
      clearTimeout(timeoutId),
    );
    analysisStartTimeouts.current.clear();
  }, []);

  const value = useMemo(
    () => ({
      analyses,
      loadingAnalyses,
      addLoadingAnalysis,
      removeLoadingAnalysis,
      getAnalysis,
      getAnalysisNames,
      filterAnalyses,
      handleMessage,
      cleanup,
    }),
    [
      analyses,
      loadingAnalyses,
      addLoadingAnalysis,
      removeLoadingAnalysis,
      getAnalysis,
      getAnalysisNames,
      filterAnalyses,
      handleMessage,
      cleanup,
    ],
  );

  return (
    <SSEAnalysesContext.Provider value={value}>
      {children}
    </SSEAnalysesContext.Provider>
  );
}

SSEAnalysesProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
