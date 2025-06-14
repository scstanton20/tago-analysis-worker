// frontend/src/contexts/websocketContext/provider.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { WebSocketContext } from './context';

// Global connection tracking to prevent multiple connections across StrictMode renders
let globalWebSocket = null;
let globalConnectionPromise = null;

export function WebSocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const lastMessageRef = useRef({ type: null, timestamp: 0 });
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectDelay = 5000;
  const mountedRef = useRef(true);

  // Track log sequences to prevent duplicates
  const logSequences = useRef(new Map()); // fileName -> Set of sequence numbers

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

  const getWebSocketUrl = () => {
    if (import.meta.env.DEV && import.meta.env.VITE_WS_URL) {
      return import.meta.env.VITE_WS_URL;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  };

  const handleMessage = useCallback(
    (event) => {
      if (!mountedRef.current) return;

      try {
        const data = JSON.parse(event.data);
        const now = Date.now();

        // Only deduplicate non-log messages by type and timestamp
        if (data.type !== 'log') {
          if (
            data.type === lastMessageRef.current.type &&
            now - lastMessageRef.current.timestamp < 50
          ) {
            return;
          }
          lastMessageRef.current = { type: data.type, timestamp: now };
        }

        switch (data.type) {
          case 'init': {
            setAnalyses(data.analyses || []);

            // Initialize log sequences tracking
            (data.analyses || []).forEach((analysis) => {
              if (!logSequences.current.has(analysis.name)) {
                logSequences.current.set(analysis.name, new Set());
              }
            });

            const analysisNames = new Set(
              (data.analyses || []).map((analysis) => analysis.name),
            );
            setLoadingAnalyses((prev) => {
              const updatedLoadingSet = new Set();
              prev.forEach((loadingName) => {
                if (!analysisNames.has(loadingName)) {
                  updatedLoadingSet.add(loadingName);
                }
              });
              return updatedLoadingSet;
            });
            break;
          }

          case 'analysisCreated':
            if (data.data?.analysis) {
              logSequences.current.set(data.data.analysis, new Set());
            }
            break;

          case 'analysisDeleted':
            if (data.data?.fileName) {
              removeLoadingAnalysis(data.data.fileName);
              logSequences.current.delete(data.data.fileName);
              setAnalyses((prev) =>
                prev.filter((a) => a.name !== data.data.fileName),
              );
            }
            break;

          case 'analysisRenamed':
            if (data.data?.oldFileName && data.data?.newFileName) {
              const oldSequences = logSequences.current.get(
                data.data.oldFileName,
              );
              if (oldSequences) {
                logSequences.current.set(data.data.newFileName, oldSequences);
                logSequences.current.delete(data.data.oldFileName);
              }

              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === data.data.oldFileName
                    ? {
                        ...analysis,
                        name: data.data.newFileName,
                        status: data.data.restarted
                          ? 'running'
                          : analysis.status,
                        enabled: data.data.restarted ? true : analysis.enabled,
                      }
                    : analysis,
                ),
              );
            }
            break;

          case 'analysisUpdated':
            if (data.data?.fileName) {
              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === data.data.fileName
                    ? {
                        ...analysis,
                        status: data.data.restarted
                          ? 'running'
                          : analysis.status,
                        enabled: data.data.restarted ? true : analysis.enabled,
                      }
                    : analysis,
                ),
              );
            }
            break;

          case 'environmentUpdated':
            if (data.data?.fileName) {
              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === data.data.fileName
                    ? {
                        ...analysis,
                        status: data.data.restarted
                          ? 'running'
                          : analysis.status,
                        enabled: data.data.restarted ? true : analysis.enabled,
                      }
                    : analysis,
                ),
              );
            }
            break;

          case 'status':
            if (data.data?.fileName) {
              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === data.data.fileName
                    ? { ...analysis, ...data.data }
                    : analysis,
                ),
              );
            }
            break;

          case 'log':
            if (data.data?.fileName && data.data?.log) {
              const { fileName, log, totalCount } = data.data;

              // Check for duplicate using sequence number
              const sequences = logSequences.current.get(fileName) || new Set();
              if (log.sequence && sequences.has(log.sequence)) {
                return; // Skip duplicate
              }

              // Add sequence to tracking
              if (log.sequence) {
                sequences.add(log.sequence);
                logSequences.current.set(fileName, sequences);
              }

              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === fileName
                    ? {
                        ...analysis,
                        logs: [log, ...(analysis.logs || [])].slice(0, 1000),
                        totalLogCount: totalCount,
                      }
                    : analysis,
                ),
              );
            }
            break;

          case 'logsCleared':
            if (data.data?.fileName) {
              const fileName = data.data.fileName;
              logSequences.current.set(fileName, new Set());

              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === fileName
                    ? {
                        ...analysis,
                        logs: [],
                        totalLogCount: 0,
                      }
                    : analysis,
                ),
              );
            }
            break;
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    },
    [removeLoadingAnalysis],
  );

  const createConnection = useCallback(async () => {
    // If we already have a working connection, reuse it
    if (globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN) {
      setSocket(globalWebSocket);
      setConnectionStatus('connected');
      return globalWebSocket;
    }

    // If connection is in progress, wait for it
    if (globalConnectionPromise) {
      return globalConnectionPromise;
    }

    // Create new connection
    globalConnectionPromise = new Promise((resolve, reject) => {
      const websocket = new WebSocket(getWebSocketUrl());
      let resolved = false;

      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          websocket.close();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      websocket.onopen = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(connectionTimeout);
          globalWebSocket = websocket;
          globalConnectionPromise = null;

          if (mountedRef.current) {
            setSocket(websocket);
            setConnectionStatus('connected');
            reconnectAttemptsRef.current = 0;
          }

          resolve(websocket);
        }
      };

      websocket.onmessage = handleMessage;

      websocket.onclose = (event) => {
        clearTimeout(connectionTimeout);

        // Clean up global references
        if (globalWebSocket === websocket) {
          globalWebSocket = null;
        }
        globalConnectionPromise = null;

        if (mountedRef.current) {
          setSocket(null);

          // Only attempt reconnection if not intentionally closed and component is mounted
          if (event.code !== 1000) {
            setConnectionStatus('disconnected');

            const delay = Math.min(
              100 * Math.pow(2, reconnectAttemptsRef.current),
              maxReconnectDelay,
            );
            reconnectAttemptsRef.current++;

            setTimeout(() => {
              if (mountedRef.current) {
                createConnection().catch(() => {
                  // Reconnection failed, will try again on next timeout
                });
              }
            }, delay);
          }
        }
      };

      websocket.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(connectionTimeout);
          globalConnectionPromise = null;
          reject(new Error('WebSocket error'));
        }
      };
    });

    try {
      return await globalConnectionPromise;
    } catch (error) {
      globalConnectionPromise = null;
      if (mountedRef.current) {
        setConnectionStatus('disconnected');
      }
      throw error;
    }
  }, [handleMessage]);

  useEffect(() => {
    mountedRef.current = true;
    setConnectionStatus('connecting');

    createConnection().catch(() => {
      if (mountedRef.current) {
        setConnectionStatus('disconnected');
      }
    });

    return () => {
      mountedRef.current = false;
      // Don't close the global connection here - let other instances use it
      // Only close when the last component unmounts (handled by beforeunload)
    };
  }, [createConnection]);

  // Clean up global connection when page unloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN) {
        globalWebSocket.close(1000, 'Page unloading');
      }
      globalWebSocket = null;
      globalConnectionPromise = null;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const reconnect = useCallback(() => {
    // Force close existing connection and create new one
    if (globalWebSocket) {
      globalWebSocket.close(1000, 'Manual reconnect');
      globalWebSocket = null;
    }
    globalConnectionPromise = null;

    setConnectionStatus('connecting');
    reconnectAttemptsRef.current = 0;

    createConnection().catch(() => {
      if (mountedRef.current) {
        setConnectionStatus('disconnected');
      }
    });
  }, [createConnection]);

  return (
    <WebSocketContext.Provider
      value={{
        socket,
        analyses,
        loadingAnalyses,
        connectionStatus,
        reconnect,
        addLoadingAnalysis,
        removeLoadingAnalysis,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

WebSocketProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
