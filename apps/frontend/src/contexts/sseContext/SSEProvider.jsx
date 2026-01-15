import { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import logger from '@/utils/logger.js';
import { showSuccess } from '@/utils/notificationService.jsx';
import { SSEConnectionProvider } from './SSEConnectionProvider.jsx';
import { SSEAnalysesProvider } from './SSEAnalysesProvider.jsx';
import { SSETeamsProvider } from './SSETeamsProvider.jsx';
import { SSEBackendProvider } from './SSEBackendProvider.jsx';
import { useAnalyses } from './hooks/useAnalyses.js';
import { useTeams } from './hooks/useTeams.js';
import { useBackend } from './hooks/useBackend.js';

// Message router component that distributes messages to appropriate contexts
function MessageRouter({ children }) {
  const analyses = useAnalyses();
  const teams = useTeams();
  const backend = useBackend();

  // Use refs to avoid re-creating handleMessage on every render
  const analysesRef = useRef(analyses);
  const teamsRef = useRef(teams);
  const backendRef = useRef(backend);

  // Update refs when context values change
  useEffect(() => {
    analysesRef.current = analyses;
    teamsRef.current = teams;
    backendRef.current = backend;
  }, [analyses, teams, backend]);

  // Stable handleMessage that doesn't change unless absolutely necessary
  const handleMessage = useCallback((data) => {
    try {
      // Route messages to appropriate contexts using refs
      switch (data.type) {
        // Analysis-related messages
        case 'init':
          analysesRef.current.handleMessage(data);
          teamsRef.current.handleMessage(data);
          break;
        case 'analysisUpdate':
        case 'analysisCreated':
        case 'analysisDeleted':
        case 'analysisRenamed':
        case 'analysisStatus':
        case 'analysisUpdated':
        case 'analysisEnvironmentUpdated':
        case 'analysisMovedToTeam':
        case 'analysisDnsStats':
        case 'analysisLogStats':
        case 'analysisProcessMetrics':
        case 'log':
        case 'logsCleared':
        case 'analysisRolledBack':
          analysesRef.current.handleMessage(data);
          break;

        // Team-related messages
        case 'teamCreated':
        case 'teamUpdated':
        case 'teamDeleted':
        case 'teamsReordered':
        case 'teamStructureUpdated':
        case 'folderCreated':
        case 'folderUpdated':
        case 'folderDeleted':
        case 'userTeamsUpdated':
          teamsRef.current.handleMessage(data);
          // Also notify analyses context about team deletion
          if (data.type === 'teamDeleted') {
            analysesRef.current.handleMessage(data);
          }
          break;

        // Backend/metrics-related messages
        case 'statusUpdate':
        case 'dnsConfigUpdated':
        case 'dnsCacheCleared':
        case 'dnsStatsReset':
        case 'metricsUpdate':
        case 'connectionLost':
          backendRef.current.handleMessage(data);
          break;

        case 'userRoleUpdated':
          // Show notification to user about role changes
          if (data.data?.showNotification && data.data?.message) {
            showSuccess(data.data.message, 'Role Updated', 5000);
          }
          // Note: Backend already sends a fresh 'init' message after role updates
          // via refreshInitDataForUser(), so we don't need to trigger 'auth-change'
          // which would clear PermissionsContext data and cause a race condition
          logger.log(
            'SSE: User role updated - new init message will arrive with updated permissions',
          );
          break;

        case 'forceLogout':
          // Force logout the user
          logger.log('SSE: Received force logout, logging out user...');
          window.dispatchEvent(
            new CustomEvent('force-logout', {
              detail: {
                reason: data.reason || 'Your session has been terminated',
                timestamp: data.timestamp,
              },
            }),
          );
          break;

        case 'userDeleted':
          // Dispatch custom event for user deletion
          logger.log('SSE: User deleted:', data.data);
          window.dispatchEvent(
            new CustomEvent('userDeleted', {
              detail: data.data,
            }),
          );
          break;

        case 'refresh':
          // Refresh data via SSE instead of page reload
          logger.log(
            'Received refresh event - data will be updated via other SSE events',
          );
          break;

        default:
          logger.log('Unhandled SSE message type:', data.type);
          break;
      }
    } catch (error) {
      // Error boundary - prevent SSE message processing errors from crashing the app
      logger.error('Error processing SSE message:', {
        type: data?.type,
        error: error.message,
        stack: error.stack,
      });
    }
  }, []); // Empty dependencies - stable function that uses refs

  return (
    <SSEConnectionProvider onMessage={handleMessage}>
      {children}
    </SSEConnectionProvider>
  );
}

MessageRouter.propTypes = {
  children: PropTypes.node.isRequired,
};

// Composite provider that wraps all 4 contexts
export function SSEProvider({ children }) {
  return (
    <SSEAnalysesProvider>
      <SSETeamsProvider>
        <SSEBackendProvider>
          <MessageRouter>{children}</MessageRouter>
        </SSEBackendProvider>
      </SSETeamsProvider>
    </SSEAnalysesProvider>
  );
}

SSEProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
