// frontend/src/contexts/sseContext/compositeProvider.jsx
import { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
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

      // User-related messages
      case 'userRemoved':
        // When user is removed from organization, log them out
        logger.log('SSE: User account removed, logging out...');
        window.location.href = '/login';
        break;

      case 'userBanned':
        // When user is banned, log them out with ban message
        logger.log(
          'SSE: User account banned, logging out...',
          data.data?.reason,
        );
        // Show ban notification
        import('@mantine/notifications').then(({ notifications }) => {
          notifications.show({
            title: 'Account Banned',
            message: data.data?.reason || 'Your account has been banned',
            color: 'red',
            autoClose: false,
          });
        });
        // Log out after a brief delay to show the notification
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        break;

      case 'userRoleUpdated':
        // Show notification to user about role changes
        if (data.data?.showNotification && data.data?.message) {
          import('@mantine/notifications').then(({ notifications }) => {
            notifications.show({
              title: 'Role Updated',
              message: data.data.message,
              color: 'green',
              autoClose: 5000,
            });
          });
        }
        // When user's role changes, trigger auth refresh
        logger.log('SSE: User role updated, triggering permissions refresh...');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('auth-change'));
        }, 1000);
        break;

      case 'userLogout': {
        logger.log('User logout event received via SSE, data:', data);
        // Dispatch custom event for AuthProvider to handle
        const customEvent = new CustomEvent('sse-user-logout', {
          detail: { type: 'user-logout', userId: data.userId },
        });
        logger.log('Dispatching sse-user-logout event:', customEvent.detail);
        window.dispatchEvent(customEvent);
        break;
      }

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
