// Enhanced AnalysisLogs.jsx - Primarily WebSocket-driven
import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { analysisService } from '../../services/analysisService';
import { RotateCw } from 'lucide-react';

const LOGS_PER_PAGE = 100;

const AnalysisLogs = ({ analysis }) => {
  const [height, setHeight] = useState(384);
  const [isResizing, setIsResizing] = useState(false);
  const [initialLogs, setInitialLogs] = useState([]);
  const [additionalLogs, setAdditionalLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef(null);
  const isLoadingMore = useRef(false);
  const hasLoadedInitial = useRef(false);

  // Primary logs come from WebSocket (analysis.logs)
  // Initial logs loaded on mount, additional logs from pagination
  const websocketLogs = analysis.logs || [];
  const totalLogCount = analysis.totalLogCount || websocketLogs.length;

  const loadInitialLogs = async () => {
    if (hasLoadedInitial.current) return;

    setIsLoading(true);
    try {
      const response = await analysisService.getLogs(analysis.name, {
        page: 1,
        limit: LOGS_PER_PAGE, // Use full page size like original
      });

      setInitialLogs(response.logs);
      // Respect the API's hasMore response
      setHasMore(response.hasMore || false);
      hasLoadedInitial.current = true;
    } catch (error) {
      console.error('Failed to fetch initial logs:', error);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreLogs = async () => {
    if (isLoadingMore.current || !hasMore) return;

    console.log('Loading more logs, current page:', page, 'hasMore:', hasMore);
    isLoadingMore.current = true;

    try {
      const nextPage = page + 1;
      const response = await analysisService.getLogs(analysis.name, {
        page: nextPage,
        limit: LOGS_PER_PAGE,
      });

      console.log(
        'Received logs:',
        response.logs?.length,
        'hasMore:',
        response.hasMore,
      );

      // Filter out logs we already have
      const existingSequences = new Set(
        [
          ...websocketLogs.map((log) => log.sequence),
          ...initialLogs.map((log) => log.sequence),
          ...additionalLogs.map((log) => log.sequence),
        ].filter(Boolean),
      );

      const newLogs = response.logs.filter(
        (log) => !existingSequences.has(log.sequence),
      );

      console.log('New logs after filtering:', newLogs.length);

      if (newLogs.length > 0) {
        setAdditionalLogs((prev) => [...prev, ...newLogs]);
      }

      setHasMore(response.hasMore);
      setPage(nextPage);
    } catch (error) {
      console.error('Failed to fetch more logs:', error);
    } finally {
      isLoadingMore.current = false;
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current || isLoadingMore.current || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Load more when scrolled near bottom (within 200px)
    if (scrollHeight - (scrollTop + clientHeight) < 200) {
      loadMoreLogs();
    }
  };

  // Load initial logs on mount or when analysis changes
  useEffect(() => {
    hasLoadedInitial.current = false;
    setInitialLogs([]);
    setAdditionalLogs([]);
    setPage(1);
    setHasMore(false); // Start with false, let API response set it
    loadInitialLogs();
  }, [analysis.name]);

  // Update hasMore based on API response
  useEffect(() => {
    // If we have initial logs loaded, check if there are more
    if (hasLoadedInitial.current && initialLogs.length > 0) {
      // hasMore should be based on the actual API response, not calculated
      // The backend tells us if there are more logs
    }
  }, [initialLogs]);

  // Combine and deduplicate all logs
  const allLogs = [...websocketLogs, ...initialLogs, ...additionalLogs]
    .filter(
      (log, index, self) =>
        index ===
        self.findIndex((l) =>
          l.sequence
            ? l.sequence === log.sequence
            : l.timestamp === log.timestamp && l.message === log.message,
        ),
    )
    .sort((a, b) => {
      // Sort by sequence if available, otherwise by timestamp
      if (a.sequence && b.sequence) return b.sequence - a.sequence;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

  return (
    <div
      className={`mt-4 bg-gray-50 rounded-md overflow-hidden ${isResizing ? 'select-none' : ''}`}
      style={{ minHeight: '96px', maxHeight: '800px' }}
    >
      <div className="p-4 sticky top-0 bg-gray-100 border-b flex justify-between items-center">
        <h4 className="text-sm font-semibold">Logs</h4>
        <div className="flex items-center gap-4">
          {(isLoading || isLoadingMore.current) && (
            <RotateCw className="w-3 h-3 animate-spin" />
          )}
          <div className="text-xs text-gray-500">
            {websocketLogs.length > 0 ? (
              <>
                {allLogs.length} of {totalLogCount} entries
                {analysis.status === 'running' ? (
                  <span className="ml-2 text-green-600">● Live</span>
                ) : (
                  <span className="ml-2 text-red-600">● Stopped</span>
                )}
              </>
            ) : (
              `${allLogs.length} entries`
            )}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="p-4 overflow-y-auto"
        style={{ height: `${height}px` }}
        onScroll={handleScroll}
      >
        {isLoading && allLogs.length === 0 ? (
          <div className="flex items-center justify-center text-gray-500">
            <RotateCw className="w-4 h-4 animate-spin mr-2" />
            Loading logs...
          </div>
        ) : allLogs.length === 0 ? (
          <p className="text-gray-500 text-sm">No logs available.</p>
        ) : (
          <>
            <div className="space-y-1 font-mono text-sm">
              {allLogs.map((log, index) => (
                <div
                  key={
                    log.sequence
                      ? `seq-${log.sequence}`
                      : `${log.timestamp}-${index}`
                  }
                  className="flex hover:bg-gray-100 p-1 rounded"
                >
                  <span className="text-gray-500 mr-2 shrink-0">
                    {log.timestamp}
                  </span>
                  <span
                    className={`${
                      log.message?.toLowerCase().includes('error')
                        ? 'text-red-600'
                        : log.message?.toLowerCase().includes('warn')
                          ? 'text-yellow-600'
                          : ''
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
            {hasMore && !isLoading && (
              <div className="text-center py-2 text-sm text-gray-500">
                {isLoadingMore.current ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin inline mr-2" />
                    Loading more...
                  </>
                ) : (
                  <button
                    onClick={loadMoreLogs}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    Load more logs...
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div
        className={`
          h-2 bg-gray-100 border-t cursor-row-resize hover:bg-gray-200 
          flex items-center justify-center
          ${isResizing ? 'bg-gray-300' : ''}
        `}
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startHeight = height;
          setIsResizing(true);

          function onMouseMove(moveEvent) {
            const delta = moveEvent.clientY - startY;
            const newHeight = Math.max(96, Math.min(800, startHeight + delta));
            setHeight(newHeight);
          }

          function onMouseUp() {
            setIsResizing(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          }

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      >
        <div className="w-16 h-1 bg-gray-300 rounded-full" />
      </div>
    </div>
  );
};

AnalysisLogs.propTypes = {
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
    logs: PropTypes.arrayOf(
      PropTypes.shape({
        sequence: PropTypes.number,
        timestamp: PropTypes.string,
        message: PropTypes.string,
      }),
    ),
    totalLogCount: PropTypes.number,
  }).isRequired,
};

export default AnalysisLogs;
