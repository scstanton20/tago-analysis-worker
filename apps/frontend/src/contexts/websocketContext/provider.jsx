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

  // Loading state management
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
          case 'init':
            setAnalyses(data.analyses || []);
            break;

          case 'analysisCreated':
            if (data.data?.analysis) {
              // Remove from loading state
              removeLoadingAnalysis(data.data.analysis.name);

              setAnalyses((prev) => {
                const exists = prev.some(
                  (a) => a.name === data.data.analysis.name,
                );
                if (exists) {
                  return prev.map((a) =>
                    a.name === data.data.analysis.name ? data.data.analysis : a,
                  );
                }
                // Add new analysis at the beginning
                return [data.data.analysis, ...prev];
              });
            }
            break;

          case 'analysisDeleted':
            if (data.data?.fileName) {
              removeLoadingAnalysis(data.data.fileName);
              setAnalyses((prev) =>
                prev.filter((a) => a.name !== data.data.fileName),
              );
            }
            break;

          case 'analysisRenamed':
            if (data.data?.oldFileName && data.data?.newFileName) {
              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === data.data.oldFileName
                    ? {
                        ...analysis,
                        name: data.data.newFileName,
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
              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === data.data.fileName
                    ? {
                        ...analysis,
                        logs: [data.data.log, ...(analysis.logs || [])],
                      }
                    : analysis,
                ),
              );
            }
            break;

          case 'clearLogs':
            if (data.data?.fileName) {
              setAnalyses((prev) =>
                prev.map((analysis) =>
                  analysis.name === data.data.fileName
                    ? { ...analysis, logs: [] }
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
