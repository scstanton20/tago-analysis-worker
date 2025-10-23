// frontend/src/contexts/sseContext/compositeProvider.jsx
import { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import { SSEConnectionProvider } from './connection/index.js';
import { SSEAnalysesProvider } from './analyses/index.js';
import { SSETeamsProvider } from './teams/index.js';
import { SSEBackendProvider } from './backend/index.js';
import { useAnalyses } from './analyses/index.js';
import { useTeams } from './teams/index.js';
import { useBackend } from './backend/index.js';
import logger from '../../utils/logger.js';

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
      case 'dnsStatsUpdate':
      case 'metricsUpdate':
        backendRef.current.handleMessage(data);
        break;

      case 'userRoleUpdated':
        // Show notification to user about role changes
        if (data.data?.showNotification && data.data?.message) {
          notifications.show({
            title: 'Role Updated',
            message: data.data.message,
            icon: <IconCheck size={16} />,
            color: 'green',
            autoClose: 5000,
          });
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
  }, []); // Empty dependencies - stable function that uses refs

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      analyses.cleanup();
    };
  }, [analyses]);

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
