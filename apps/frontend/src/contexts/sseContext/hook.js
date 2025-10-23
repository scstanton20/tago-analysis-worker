// frontend/src/contexts/sseContext/hook.js
import { useMemo } from 'react';
import { useConnection } from './connection/index.js';
import { useAnalyses } from './analyses/index.js';
import { useTeams } from './teams/index.js';
import { useBackend } from './backend/index.js';

/**
 * Backward-compatible hook that combines all SSE contexts
 * @deprecated Use specific hooks (useConnection, useAnalyses, useTeams, useBackend) instead
 */
export function useSSE() {
  const connection = useConnection();
  const analysesCtx = useAnalyses();
  const teamsCtx = useTeams();
  const backend = useBackend();

  return useMemo(
    () => ({
      // Core state from analyses context
      analyses: analysesCtx.analyses,
      loadingAnalyses: analysesCtx.loadingAnalyses,
      addLoadingAnalysis: analysesCtx.addLoadingAnalysis,
      removeLoadingAnalysis: analysesCtx.removeLoadingAnalysis,
      getAnalysis: analysesCtx.getAnalysis,
      getAnalysisNames: analysesCtx.getAnalysisNames,
      filterAnalyses: analysesCtx.filterAnalyses,

      // Derived analysis helpers
      getAnalysisCount: () => Object.keys(analysesCtx.analyses).length,
      getAnalysesByTeam: (teamId) => {
        return Object.values(analysesCtx.analyses).filter(
          (analysis) => analysis.teamId === teamId,
        );
      },

      // Teams state
      teams: teamsCtx.teams,
      teamStructure: teamsCtx.teamStructure,
      teamStructureVersion: teamsCtx.teamStructureVersion,
      getTeam: teamsCtx.getTeam,
      getTeamNames: teamsCtx.getTeamNames,

      // Derived team helpers
      getTeamAnalysisCount: (teamId) => {
        return Object.values(analysesCtx.analyses).filter(
          (analysis) => analysis.teamId === teamId,
        ).length;
      },

      // Connection state
      connectionStatus: connection.connectionStatus,
      hasInitialData: connection.hasInitialData,
      serverShutdown: connection.serverShutdown,
      requestStatusUpdate: connection.requestStatusUpdate,
      sessionId: connection.sessionId,
      subscribeToAnalysis: connection.subscribeToAnalysis,
      unsubscribeFromAnalysis: connection.unsubscribeFromAnalysis,

      // Backend state
      backendStatus: backend.backendStatus,
      dnsCache: backend.dnsCache,
      metricsData: backend.metricsData,
    }),
    [connection, analysesCtx, teamsCtx, backend],
  );
}
