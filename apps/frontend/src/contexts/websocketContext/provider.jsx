// frontend/src/contexts/websocketContext/provider.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { WebSocketContext } from './context';

export function WebSocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const lastMessageRef = useRef({ type: null, timestamp: 0 });
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectDelay = 5000;
  const connectingRef = useRef(false);

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
      try {
        const data = JSON.parse(event.data);
        const now = Date.now();

        if (
          data.type === lastMessageRef.current.type &&
          now - lastMessageRef.current.timestamp < 50
        ) {
          return;
        }

        lastMessageRef.current = { type: data.type, timestamp: now };

        switch (data.type) {
          case 'init': {
            console.log(
              'Received init message with analyses:',
              data.analyses?.length || 0,
            );
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
              // Initialize log tracking for new analysis
              logSequences.current.set(data.data.analysis, new Set());
              console.log('Analysis created, waiting for refresh...');
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
              // Transfer log sequences to new name
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
                    ? { ...analysis, name: data.data.newFileName }
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
                        logs: [log, ...(analysis.logs || [])].slice(0, 1000), // Keep recent 1000
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
              // Clear sequence tracking
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

  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connect = () => {
      if (ws?.readyState === WebSocket.OPEN) return;

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      setConnectionStatus('connecting');
      connectingRef.current = true;

      try {
        ws = new WebSocket(getWebSocketUrl());

        const connectionTimeout = setTimeout(() => {
          if (connectingRef.current && ws.readyState !== WebSocket.OPEN) {
            console.log('WebSocket connection timeout');
            ws.close();
          }
        }, 5000);

        ws.onopen = () => {
          clearTimeout(connectionTimeout);
          connectingRef.current = false;
          console.log('WebSocket connected');
          setConnectionStatus('connected');
          setSocket(ws);
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = handleMessage;

        ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('WebSocket disconnected', event.code, event.reason);

          if (!connectingRef.current) {
            setConnectionStatus('disconnected');
          }

          setSocket(null);

          const delay = Math.min(
            100 * Math.pow(2, reconnectAttemptsRef.current),
            maxReconnectDelay,
          );
          reconnectAttemptsRef.current++;

          console.log(
            `Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`,
          );
          reconnectTimeout = setTimeout(connect, delay);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        connectingRef.current = false;
        setConnectionStatus('connecting');

        const delay = Math.min(
          100 * Math.pow(2, reconnectAttemptsRef.current),
          maxReconnectDelay,
        );
        reconnectAttemptsRef.current++;
        reconnectTimeout = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws?.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [handleMessage]);

  const reconnect = useCallback(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.close();
    } else {
      setConnectionStatus('connecting');
      reconnectAttemptsRef.current = 0;
    }
  }, [socket]);

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
