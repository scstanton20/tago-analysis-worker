import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import logger from '@/utils/logger';
import {
  showSuccess,
  showError,
  showInfo,
} from '@/utils/notificationService.jsx';
// Web worker for log processing (deduplication, sequence tracking)
import {
  processLog as workerProcessLog,
  clearSequences as workerClearSequences,
  initSequences as workerInitSequences,
  terminateWorker,
} from '@/workers/sseWorkerClient';
import { AnalysesContext } from './contexts/AnalysesContext.js';

export function SSEAnalysesProvider({ children }) {
  // Analyses keyed by analysisId (UUID)
  const [analyses, setAnalyses] = useState({});
  const [loadingAnalyses, setLoadingAnalyses] = useState(new Set());
  // DNS stats keyed by analysisId (UUID) - populated via SSE channel subscription
  const [analysisDnsStats, setAnalysisDnsStats] = useState({});

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      terminateWorker();
    };
  }, []);

  const addLoadingAnalysis = useCallback((analysisId) => {
    setLoadingAnalyses((prev) => new Set([...prev, analysisId]));
  }, []);

  const removeLoadingAnalysis = useCallback((analysisId) => {
    setLoadingAnalyses((prev) => {
      const newSet = new Set(prev);
      newSet.delete(analysisId);
      return newSet;
    });
  }, []);

  const getAnalysis = useCallback(
    (analysisId) => {
      return analyses[analysisId] || null;
    },
    [analyses],
  );

  const getAnalysisIds = useCallback(() => {
    return Object.keys(analyses);
  }, [analyses]);

  const filterAnalyses = useCallback(
    (predicate) => {
      return Object.entries(analyses)
        .filter(([, analysis]) => predicate(analysis))
        .reduce((acc, [analysisId, analysis]) => {
          acc[analysisId] = analysis;
          return acc;
        }, {});
    },
    [analyses],
  );

  const getAnalysisDnsStats = useCallback(
    (analysisId) => {
      return analysisDnsStats[analysisId] || null;
    },
    [analysisDnsStats],
  );

  // Event Handlers
  const handleInit = useCallback((data) => {
    // Handle analyses - keyed by analysisId (UUID)
    let analysesObj = {};
    if (data.analyses) {
      if (Array.isArray(data.analyses)) {
        // Convert array to object keyed by id
        data.analyses.forEach((analysis) => {
          analysesObj[analysis.id] = {
            ...analysis,
            logs: analysis.logs || [], // Ensure logs is always an array
          };
        });
      } else {
        // Already keyed by analysisId
        analysesObj = Object.entries(data.analyses).reduce(
          (acc, [id, analysis]) => {
            acc[id] = {
              ...analysis,
              logs: analysis.logs || [], // Ensure logs is always an array
            };
            return acc;
          },
          {},
        );
      }
    }

    setAnalyses(analysesObj);

    // Initialize log sequences tracking in worker (fire-and-forget)
    const analysisIdList = Object.keys(analysesObj);
    workerInitSequences(analysisIdList).catch((err) => {
      logger.error('Failed to init sequences in worker:', err);
    });

    const analysisIds = new Set(analysisIdList);
    setLoadingAnalyses((prev) => {
      const updatedLoadingSet = new Set();
      prev.forEach((loadingId) => {
        if (!analysisIds.has(loadingId)) {
          updatedLoadingSet.add(loadingId);
        }
      });
      return updatedLoadingSet;
    });
  }, []);

  const handleAnalysisUpdate = useCallback(
    (data) => {
      if (data.analysisId && data.update) {
        const analysisId = data.analysisId;
        const analysisName = data.analysisName || data.update.name;

        setAnalyses((prev) => ({
          ...prev,
          [analysisId]: {
            ...prev[analysisId],
            ...data.update,
          },
        }));

        // Always remove loading state when we get a status update
        removeLoadingAnalysis(analysisId);

        // Show notifications for status changes
        if (data.update.status === 'running') {
          showSuccess(`${analysisName} is now running`, 'Started', 3000);
        } else if (
          data.update.status === 'stopped' &&
          data.update.exitCode !== undefined
        ) {
          // Clear log sequences in worker (fire-and-forget)
          workerClearSequences(analysisId).catch((err) => {
            logger.error('Failed to clear sequences in worker:', err);
          });

          // Analysis stopped
          if (data.update.exitCode === 0) {
            // Normal exit - use info notification with X icon for stopped
            showInfo(`${analysisName} stopped`, 'Stopped', 3000);
          } else {
            // Error exit
            showError(
              `${analysisName} exited with code ${data.update.exitCode}`,
              'Failed',
              5000,
            );
          }
        }
      }
    },
    [removeLoadingAnalysis],
  );

  const handleAnalysisCreated = useCallback((data) => {
    if (data.data?.analysisId) {
      const { analysisId, analysisName, teamId, analysisData } = data.data;
      // Initialize sequences for new analysis in worker (fire-and-forget)
      workerInitSequences([analysisId]).catch((err) => {
        logger.error('Failed to init sequences for new analysis:', err);
      });

      if (analysisData) {
        const newAnalysis = {
          ...analysisData,
          id: analysisId,
          name: analysisName,
          teamId: teamId || 'uncategorized',
          logs: analysisData.logs || [], // Ensure logs is always an array
        };

        setAnalyses((prev) => ({
          ...prev,
          [analysisId]: newAnalysis,
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
    if (data.data?.analysisId) {
      const { analysisId } = data.data;
      setLoadingAnalyses((prev) => {
        const newSet = new Set(prev);
        newSet.delete(analysisId);
        return newSet;
      });
      // Clear sequences for deleted analysis in worker (fire-and-forget)
      workerClearSequences(analysisId).catch((err) => {
        logger.error('Failed to clear sequences for deleted analysis:', err);
      });
      setAnalyses((prev) => {
        const newAnalyses = { ...prev };
        delete newAnalyses[analysisId];
        return newAnalyses;
      });
    }
  }, []);

  /**
   * Unified handler for analysis metadata updates.
   * Handles: analysisUpdated, analysisRenamed, analysisEnvironmentUpdated
   */
  const handleAnalysisMetadataUpdated = useCallback(
    (data) => {
      if (!data.data?.analysisId) return;

      const { analysisId, restarted, teamId, lastRun, startTime, newName } =
        data.data;

      setAnalyses((prev) => {
        if (!prev[analysisId]) return prev;
        return {
          ...prev,
          [analysisId]: {
            ...prev[analysisId],
            ...(newName && { name: newName }),
            status: restarted ? 'running' : prev[analysisId].status,
            enabled: restarted ? true : prev[analysisId].enabled,
            teamId: teamId || prev[analysisId].teamId,
            lastRun: lastRun || prev[analysisId].lastRun,
            startTime: startTime || prev[analysisId].startTime,
          },
        };
      });

      if (!restarted) {
        removeLoadingAnalysis(analysisId);
      }
    },
    [removeLoadingAnalysis],
  );

  // Track seen sequences locally for fast synchronous duplicate check
  // Worker handles long-term tracking and cleanup
  const recentSequences = useRef(new Map());

  const handleLog = useCallback((data) => {
    if (data.data?.analysisId && data.data?.log) {
      const { analysisId, log, totalCount, logFileSize } = data.data;

      // Fast synchronous duplicate check using local cache
      if (log.sequence) {
        const analysisSeqs = recentSequences.current.get(analysisId);
        if (analysisSeqs?.has(log.sequence)) {
          return; // Skip duplicate
        }

        // Track locally
        if (!analysisSeqs) {
          recentSequences.current.set(analysisId, new Set([log.sequence]));
        } else {
          analysisSeqs.add(log.sequence);
          // Keep local cache small (last 100 sequences per analysis)
          if (analysisSeqs.size > 100) {
            const arr = Array.from(analysisSeqs);
            recentSequences.current.set(analysisId, new Set(arr.slice(-100)));
          }
        }
      }

      // Track in worker for cross-session deduplication (fire-and-forget)
      workerProcessLog(analysisId, log).catch(() => {
        // Ignore worker errors for log processing
      });

      setAnalyses((prev) => {
        if (!prev[analysisId]) return prev;
        return {
          ...prev,
          [analysisId]: {
            ...prev[analysisId],
            logs: [log, ...(prev[analysisId]?.logs || [])].slice(0, 1000),
            totalLogCount: totalCount,
            logFileSize: logFileSize,
          },
        };
      });
    }
  }, []);

  const handleLogsCleared = useCallback((data) => {
    if (data.data?.analysisId) {
      const { analysisId, analysisName, clearMessage } = data.data;
      logger.log(`Clearing logs for ${analysisName || analysisId}`);

      // Clear local sequence cache
      recentSequences.current.delete(analysisId);
      // Clear worker sequences (fire-and-forget)
      workerClearSequences(analysisId).catch(() => {});

      // If clearMessage is provided, show it as the only log entry
      const clearedLogs = clearMessage ? [clearMessage] : [];

      setAnalyses((prev) => {
        if (!prev[analysisId]) return prev;
        return {
          ...prev,
          [analysisId]: {
            ...prev[analysisId],
            logs: clearedLogs,
            totalLogCount: clearedLogs.length,
            logFileSize: 0,
            logsClearedAt: Date.now(),
          },
        };
      });
    }
  }, []);

  const handleAnalysisRolledBack = useCallback((data) => {
    if (data.data?.analysisId) {
      const { analysisId, analysisName, version, restarted, ...analysisData } =
        data.data;

      // Clear log sequences for fresh start
      recentSequences.current.delete(analysisId);
      workerClearSequences(analysisId).catch(() => {});

      // Update analysis with rollback information
      setAnalyses((prev) => {
        if (!prev[analysisId]) return prev;
        return {
          ...prev,
          [analysisId]: {
            ...prev[analysisId],
            ...analysisData,
            logs: [], // Clear logs since they were cleared during rollback
            totalLogCount: 0,
            logFileSize: 0,
            currentVersion: version,
          },
        };
      });

      logger.log(
        `Analysis ${analysisName || analysisId} rolled back to version ${version}${restarted ? ' and restarted' : ''}`,
      );
    }
  }, []);

  const handleAnalysisMovedToTeam = useCallback((data) => {
    if (data.analysisId && data.to) {
      setAnalyses((prev) => {
        if (!prev[data.analysisId]) return prev;
        return {
          ...prev,
          [data.analysisId]: {
            ...prev[data.analysisId],
            teamId: data.to,
          },
        };
      });
    }
  }, []);

  const handleTeamDeleted = useCallback((data) => {
    if (data.deleted) {
      // Update analyses when a team is deleted
      setAnalyses((prev) => {
        const newAnalyses = {};
        Object.entries(prev).forEach(([analysisId, analysis]) => {
          if (analysis.teamId === data.deleted) {
            // Move analyses from deleted team to target team
            const targetTeamId = data.analysesMovedTo || 'uncategorized';
            logger.log(
              `SSE: Moving analysis ${analysis.name || analysisId} from deleted team ${data.deleted} to ${targetTeamId}`,
            );
            newAnalyses[analysisId] = { ...analysis, teamId: targetTeamId };
          } else {
            newAnalyses[analysisId] = analysis;
          }
        });
        return newAnalyses;
      });
    }
  }, []);

  const handleAnalysisDnsStats = useCallback((data) => {
    if (data.analysisId && data.stats) {
      setAnalysisDnsStats((prev) => ({
        ...prev,
        [data.analysisId]: {
          ...data.stats,
          enabled: data.enabled, // Include enabled flag from message
        },
      }));
    }
  }, []);

  // Message handler to be called by parent
  const handleMessage = useCallback(
    (data) => {
      try {
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
          // Consolidated handler for metadata updates (renamed, updated, env updated)
          case 'analysisRenamed':
          case 'analysisUpdated':
          case 'analysisEnvironmentUpdated':
            handleAnalysisMetadataUpdated(data);
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
          case 'analysisDnsStats':
            handleAnalysisDnsStats(data);
            break;
          default:
            break;
        }
      } catch (error) {
        logger.error('Error in SSEAnalysesProvider handleMessage:', {
          type: data?.type,
          error: error.message,
        });
      }
    },
    [
      handleInit,
      handleAnalysisUpdate,
      handleAnalysisCreated,
      handleAnalysisDeleted,
      handleAnalysisMetadataUpdated,
      handleLog,
      handleLogsCleared,
      handleAnalysisRolledBack,
      handleAnalysisMovedToTeam,
      handleTeamDeleted,
      handleAnalysisDnsStats,
    ],
  );

  const value = useMemo(
    () => ({
      analyses,
      loadingAnalyses,
      addLoadingAnalysis,
      removeLoadingAnalysis,
      getAnalysis,
      getAnalysisIds,
      filterAnalyses,
      getAnalysisDnsStats,
      handleMessage,
    }),
    [
      analyses,
      loadingAnalyses,
      addLoadingAnalysis,
      removeLoadingAnalysis,
      getAnalysis,
      getAnalysisIds,
      filterAnalyses,
      getAnalysisDnsStats,
      handleMessage,
    ],
  );

  return (
    <AnalysesContext.Provider value={value}>
      {children}
    </AnalysesContext.Provider>
  );
}

SSEAnalysesProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
