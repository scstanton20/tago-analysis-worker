// frontend/src/contexts/sseContext/connection/provider.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { SSEConnectionContext } from './context';
import { useAuth } from '../../../hooks/useAuth';
import logger from '../../../utils/logger';
import { isDevelopment, API_URL } from '../../../config/env.js';
import { showError } from '../../../utils/notificationService.jsx';

export function SSEConnectionProvider({ children, onMessage }) {
  const { isAuthenticated } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [hasInitialData, setHasInitialData] = useState(false);
  const [serverShutdown, setServerShutdown] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const eventSourceRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectRef = useRef(null);
  const maxReconnectAttempts = 10;
  const maxReconnectDelay = 30000;
  const mountedRef = useRef(true);
  const connectionStatusRef = useRef('connecting');
  const subscribedAnalyses = useRef(new Set());

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
        // Pass status update to message handler
        if (onMessage) {
          onMessage({ type: 'statusUpdate', data });
        }
      }
    } catch (error) {
      logger.error('Error requesting status update:', error);
    }
  }, [isAuthenticated, onMessage]);

  // Handle session invalidation
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
      false,
    );
  }, []);

  const handleMessage = useCallback(
    (event) => {
      if (!mountedRef.current) return;

      try {
        const data = JSON.parse(event.data);

        // Skip heartbeat messages
        if (data.type === 'heartbeat' || data.type === 'connection') {
          return;
        }

        // Handle init message to set hasInitialData and capture sessionId
        if (data.type === 'init') {
          setHasInitialData(true);

          if (data.sessionId) {
            setSessionId(data.sessionId);
          }
        }

        // Handle session invalidation locally
        if (data.type === 'sessionInvalidated') {
          handleSessionInvalidated(data);
          return;
        }

        // Forward all messages to parent handler
        if (onMessage) {
          onMessage(data);
        }
      } catch (error) {
        logger.error('Error handling SSE message:', error);
      }
    },
    [onMessage, handleSessionInvalidated],
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
        logger.info('Live SSE Connected');

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
  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  useEffect(() => {
    mountedRef.current = true;

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
        return { success: false, error: 'Not connected' };
      }

      if (!Array.isArray(analysisNames) || analysisNames.length === 0) {
        return { success: false, error: 'Invalid analysis names' };
      }

      try {
        const response = await fetch('/api/sse/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId, analyses: analysisNames }),
        });

        if (!response.ok) {
          const error = await response.json();
          logger.error('Subscribe failed:', error);
          return { success: false, error: error.error || 'Subscribe failed' };
        }

        const result = await response.json();

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
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId, analyses: analysisNames }),
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

  const value = useMemo(
    () => ({
      connectionStatus,
      hasInitialData,
      serverShutdown,
      requestStatusUpdate,
      sessionId,
      subscribeToAnalysis,
      unsubscribeFromAnalysis,
    }),
    [
      connectionStatus,
      hasInitialData,
      serverShutdown,
      requestStatusUpdate,
      sessionId,
      subscribeToAnalysis,
      unsubscribeFromAnalysis,
    ],
  );

  return (
    <SSEConnectionContext.Provider value={value}>
      {children}
    </SSEConnectionContext.Provider>
  );
}

SSEConnectionProvider.propTypes = {
  children: PropTypes.node.isRequired,
  onMessage: PropTypes.func,
};
