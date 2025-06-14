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
  const [backendStatus, setBackendStatus] = useState(null);
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

  // Function to request status update from server
  const requestStatusUpdate = useCallback(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'requestStatus' }));
    }
  }, [socket]);

  const handleMessage = useCallback(
    (event) => {
      if (!mountedRef.current) return;

      try {
        const data = JSON.parse(event.data);
        const now = Date.now();

        // Only deduplicate non-log messages by type and timestamp
        if (data.type !== 'log' && data.type !== 'statusUpdate') {
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

          case 'statusUpdate': {
            // Handle status updates from WebSocket
            if (data.data) {
              setBackendStatus(data.data);
            }
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
          case 'analysisStatus':
            removeLoadingAnalysis(data.data.fileName);
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
          case 'analysisUpdated':
            if (data.data?.analysis) {
              const updatedAnalysis = data.data.analysis;
              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === updatedAnalysis.name
                    ? { ...analysis, ...updatedAnalysis }
                    : analysis,
                ),
              );
              if (updatedAnalysis.status !== 'running') {
                removeLoadingAnalysis(updatedAnalysis.name);
              }
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

      websocket.onerror = (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(connectionTimeout);
          globalConnectionPromise = null;
          reject(error);
        }
      };

      websocket.onclose = () => {
        if (mountedRef.current) {
          setConnectionStatus('disconnected');
          setSocket(null);
          // Clear backend status when connection is lost
          setBackendStatus(null);
        }
        globalWebSocket = null;
        globalConnectionPromise = null;
      };

      websocket.onmessage = handleMessage;
    });

    return globalConnectionPromise;
  }, [handleMessage]);

  const reconnect = useCallback(async () => {
    if (!mountedRef.current) return;

    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttemptsRef.current),
      maxReconnectDelay,
    );
    reconnectAttemptsRef.current++;

    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current})`,
    );

    setTimeout(async () => {
      if (!mountedRef.current) return;

      setConnectionStatus('connecting');
      try {
        await createConnection();
      } catch (error) {
        console.error('Reconnection failed:', error);
        if (mountedRef.current) {
          setConnectionStatus('disconnected');
          reconnect();
        }
      }
    }, delay);
  }, [createConnection]);

  useEffect(() => {
    mountedRef.current = true;

    const connect = async () => {
      try {
        setConnectionStatus('connecting');
        const ws = await createConnection();

        if (ws && mountedRef.current) {
          ws.onclose = () => {
            if (mountedRef.current) {
              setConnectionStatus('disconnected');
              setSocket(null);
              setBackendStatus(null); // Clear backend status on disconnect
              reconnect();
            }
          };

          ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            if (mountedRef.current) {
              setConnectionStatus('disconnected');
              setSocket(null);
              setBackendStatus(null); // Clear backend status on error
            }
          };
        }
      } catch (error) {
        console.error('Initial connection failed:', error);
        if (mountedRef.current) {
          setConnectionStatus('disconnected');
          reconnect();
        }
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (globalWebSocket) {
        globalWebSocket.close();
        globalWebSocket = null;
      }
      globalConnectionPromise = null;
    };
  }, [createConnection, reconnect]);

  // Request status updates periodically (fallback)
  useEffect(() => {
    if (connectionStatus === 'connected' && socket) {
      // Request initial status
      requestStatusUpdate();

      // Set up periodic status requests (as backup)
      const interval = setInterval(requestStatusUpdate, 60000); // Every minute

      return () => clearInterval(interval);
    }
  }, [connectionStatus, socket, requestStatusUpdate]);

  const value = {
    socket,
    analyses,
    loadingAnalyses,
    addLoadingAnalysis,
    removeLoadingAnalysis,
    connectionStatus,
    backendStatus, // Expose backend status
    requestStatusUpdate, // Expose manual status request function
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

WebSocketProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
