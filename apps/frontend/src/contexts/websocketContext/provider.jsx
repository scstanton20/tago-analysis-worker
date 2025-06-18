// frontend/src/contexts/websocketContext/provider.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { WebSocketContext } from './context';

// Global connection tracking to prevent multiple connections across StrictMode renders
let globalWebSocket = null;
let globalConnectionPromise = null;

export function WebSocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [analyses, setAnalyses] = useState({}); // Object: { analysisName: analysisData }
  const [departments, setDepartments] = useState({}); // FIXED: Object: { deptId: deptData }
  const [loadingAnalyses, setLoadingAnalyses] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [backendStatus, setBackendStatus] = useState(null);
  const [hasInitialData, setHasInitialData] = useState(false); // NEW: Track if we've ever loaded data
  const lastMessageRef = useRef({ type: null, timestamp: 0 });
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10; // NEW: Limit reconnection attempts
  const maxReconnectDelay = 30000; // Increased max delay to 30 seconds
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

  // ADDED: getDepartment helper function
  const getDepartment = useCallback(
    (departmentId) => {
      return departments[departmentId] || null;
    },
    [departments],
  );

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
            // Handle analyses - always store as object
            let analysesObj = {};
            if (data.analyses) {
              if (Array.isArray(data.analyses)) {
                // Convert array to object
                data.analyses.forEach((analysis) => {
                  analysesObj[analysis.name] = analysis;
                });
              } else {
                // Already an object
                analysesObj = data.analyses;
              }
            }

            // FIXED: Handle departments - store as object
            let departmentsObj = {};
            if (data.departments) {
              if (Array.isArray(data.departments)) {
                // Convert array to object
                data.departments.forEach((dept) => {
                  departmentsObj[dept.id] = dept;
                });
              } else {
                // Already an object
                departmentsObj = data.departments;
              }
            }

            setAnalyses(analysesObj);
            setDepartments(departmentsObj);
            setHasInitialData(true); // Mark that we've loaded initial data
            // Data is loaded when we have analyses and departments data

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

            break;
          }

          case 'statusUpdate': {
            // Handle status updates from WebSocket
            if (data.container_health) {
              // Direct status structure
              setBackendStatus(data);
            } else if (data.data) {
              // Wrapped in data property
              setBackendStatus(data.data);
            }
            break;
          }

          case 'analysisUpdate':
            // Handle the new update format from broadcast
            if (data.analysisName && data.update) {
              setAnalyses((prev) => ({
                ...prev,
                [data.analysisName]: {
                  ...prev[data.analysisName],
                  ...data.update,
                },
              }));
            }
            break;

          case 'refresh':
            // Re-request data - use the global socket
            if (
              globalWebSocket &&
              globalWebSocket.readyState === WebSocket.OPEN
            ) {
              globalWebSocket.send(JSON.stringify({ type: 'requestAnalyses' }));
            }
            break;

          case 'analysisCreated':
            if (data.data?.analysis) {
              logSequences.current.set(data.data.analysis, new Set());

              // If we have complete analysis data, add it immediately
              if (data.data.analysisData) {
                const newAnalysis = {
                  ...data.data.analysisData,
                  name: data.data.analysis,
                  department: data.data.department || 'uncategorized',
                };

                setAnalyses((prev) => ({
                  ...prev,
                  [data.data.analysis]: newAnalysis,
                }));
              } else {
                // Force refresh to get complete analysis data
                if (
                  globalWebSocket &&
                  globalWebSocket.readyState === WebSocket.OPEN
                ) {
                  globalWebSocket.send(
                    JSON.stringify({ type: 'requestAnalyses' }),
                  );
                }
              }
            }
            break;

          case 'analysisDeleted':
            if (data.data?.fileName) {
              removeLoadingAnalysis(data.data.fileName);
              logSequences.current.delete(data.data.fileName);
              setAnalyses((prev) => {
                const newAnalyses = { ...prev };
                delete newAnalyses[data.data.fileName];
                return newAnalyses;
              });
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

              setAnalyses((prev) => {
                const newAnalyses = { ...prev };
                const analysis = newAnalyses[data.data.oldFileName];
                if (analysis) {
                  newAnalyses[data.data.newFileName] = {
                    ...analysis,
                    name: data.data.newFileName,
                    status: data.data.restarted ? 'running' : analysis.status,
                    enabled: data.data.restarted ? true : analysis.enabled,
                    department: data.data.department || analysis.department,
                  };
                  delete newAnalyses[data.data.oldFileName];
                }
                return newAnalyses;
              });
            }
            break;

          case 'analysisStatus':
            if (data.data?.fileName) {
              removeLoadingAnalysis(data.data.fileName);
              setAnalyses((prev) => ({
                ...prev,
                [data.data.fileName]: {
                  ...prev[data.data.fileName],
                  status: data.data.status,
                  enabled: data.data.enabled,
                  department:
                    data.data.department ||
                    prev[data.data.fileName]?.department,
                  lastRun:
                    data.data.lastRun || prev[data.data.fileName]?.lastRun,
                  startTime:
                    data.data.startTime || prev[data.data.fileName]?.startTime,
                },
              }));
            }
            break;

          case 'analysisUpdated':
            if (data.data?.fileName) {
              setAnalyses((prev) => ({
                ...prev,
                [data.data.fileName]: {
                  ...prev[data.data.fileName],
                  status: data.data.status || prev[data.data.fileName]?.status,
                  department:
                    data.data.department ||
                    prev[data.data.fileName]?.department,
                  lastRun:
                    data.data.lastRun || prev[data.data.fileName]?.lastRun,
                  startTime:
                    data.data.startTime || prev[data.data.fileName]?.startTime,
                },
              }));
              if (data.data.status !== 'running') {
                removeLoadingAnalysis(data.data.fileName);
              }
            }
            break;

          case 'analysisEnvironmentUpdated':
            if (data.data?.fileName) {
              setAnalyses((prev) => ({
                ...prev,
                [data.data.fileName]: {
                  ...prev[data.data.fileName],
                  status: data.data.status || prev[data.data.fileName]?.status,
                  department:
                    data.data.department ||
                    prev[data.data.fileName]?.department,
                  lastRun:
                    data.data.lastRun || prev[data.data.fileName]?.lastRun,
                  startTime:
                    data.data.startTime || prev[data.data.fileName]?.startTime,
                },
              }));
            }
            break;

          // FIXED: Department-related messages - handle objects
          case 'departmentCreated':
          case 'departmentUpdated':
            if (data.department) {
              setDepartments((prev) => ({
                ...prev,
                [data.department.id]: data.department,
              }));
            }
            break;

          case 'departmentDeleted':
            if (data.deleted) {
              setDepartments((prev) => {
                const newDepts = { ...prev };
                delete newDepts[data.deleted];
                return newDepts;
              });
              // Update analyses to move to new department
              if (data.analysesMovedTo) {
                setAnalyses((prev) => {
                  const newAnalyses = {};
                  Object.entries(prev).forEach(([name, analysis]) => {
                    newAnalyses[name] =
                      analysis.department === data.deleted
                        ? { ...analysis, department: data.analysesMovedTo }
                        : analysis;
                  });
                  return newAnalyses;
                });
              }
            }
            break;

          case 'analysisMovedToDepartment':
            if (data.analysis && data.to) {
              setAnalyses((prev) => ({
                ...prev,
                [data.analysis]: {
                  ...prev[data.analysis],
                  department: data.to,
                },
              }));
            }
            break;

          case 'departmentsReordered':
            if (data.departments) {
              let departmentsObj = {};
              if (Array.isArray(data.departments)) {
                // Convert array to object
                data.departments.forEach((dept) => {
                  departmentsObj[dept.id] = dept;
                });
              } else {
                // Already an object
                departmentsObj = data.departments;
              }
              setDepartments(departmentsObj);
            }
            break;

          case 'log':
            // Handle log messages correctly
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

              setAnalyses((prev) => ({
                ...prev,
                [fileName]: {
                  ...prev[fileName],
                  logs: [log, ...(prev[fileName]?.logs || [])].slice(0, 1000),
                  totalLogCount: totalCount,
                },
              }));
            }
            break;

          case 'logsCleared':
            if (data.data?.fileName) {
              const fileName = data.data.fileName;
              logSequences.current.set(fileName, new Set());

              setAnalyses((prev) => ({
                ...prev,
                [fileName]: {
                  ...prev[fileName],
                  logs: [],
                  totalLogCount: 0,
                },
              }));
            }
            break;

          default:
            console.log('Unhandled WebSocket message type:', data.type);
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

    // Stop reconnecting after max attempts
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log(
        `Max reconnection attempts (${maxReconnectAttempts}) reached. Stopping reconnection attempts.`,
      );
      setConnectionStatus('failed');
      return;
    }

    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttemptsRef.current),
      maxReconnectDelay,
    );
    reconnectAttemptsRef.current++;

    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`,
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

  // FIXED: Provide consistent object structures
  const value = {
    socket,
    analyses, // Object format: { analysisName: analysisData }
    departments, // Object format: { deptId: deptData }
    loadingAnalyses,
    addLoadingAnalysis,
    removeLoadingAnalysis,
    connectionStatus,
    backendStatus,
    requestStatusUpdate,
    getDepartment, // ADDED: Helper function
    hasInitialData, // NEW: Expose initial data status
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
