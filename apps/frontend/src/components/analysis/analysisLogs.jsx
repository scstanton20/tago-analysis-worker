// Enhanced AnalysisLogs.jsx - Uses props from AnalysisItem
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
  const lastScrollTop = useRef(0);
  const shouldAutoScroll = useRef(true);

  // Use logs directly from props (passed from AnalysisItem which gets from WebSocket)
  const websocketLogs = analysis.logs || [];
  const totalLogCount = analysis.totalLogCount || websocketLogs.length;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (
      shouldAutoScroll.current &&
      scrollRef.current &&
      websocketLogs.length > 0
    ) {
      const element = scrollRef.current;
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        element.scrollTop = element.scrollHeight;
      }, 0);
    }
  }, [websocketLogs.length]);

  const loadInitialLogs = async () => {
    if (hasLoadedInitial.current) return;

    setIsLoading(true);
    try {
      const response = await analysisService.getLogs(analysis.name, {
        page: 1,
        limit: LOGS_PER_PAGE,
      });

      if (response.logs) {
        setInitialLogs(response.logs);
        setHasMore(response.hasMore || false);
      }
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

      const newLogs =
        response.logs?.filter((log) => !existingSequences.has(log.sequence)) ||
        [];

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
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Check if user scrolled up manually
    if (scrollTop < lastScrollTop.current) {
      shouldAutoScroll.current = false;
    }

    // Re-enable auto-scroll if user scrolls to bottom
    if (scrollHeight - (scrollTop + clientHeight) < 50) {
      shouldAutoScroll.current = true;
    }

    lastScrollTop.current = scrollTop;

    // Load more when scrolled near bottom (within 200px) and not loading
    if (
      !isLoadingMore.current &&
      hasMore &&
      scrollHeight - (scrollTop + clientHeight) < 200
    ) {
      loadMoreLogs();
    }
  };

  // Load initial logs on mount or when analysis changes
  useEffect(() => {
    hasLoadedInitial.current = false;
    setInitialLogs([]);
    setAdditionalLogs([]);
    setPage(1);
    setHasMore(false);
    shouldAutoScroll.current = true;
    loadInitialLogs();
  }, [analysis.name]);

  // Reset when logs are cleared
  useEffect(() => {
    if (websocketLogs.length === 0 && hasLoadedInitial.current) {
      setInitialLogs([]);
      setAdditionalLogs([]);
      setPage(1);
      setHasMore(false);
      shouldAutoScroll.current = true;
    }
  }, [websocketLogs.length]);

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
      className={`mt-4 bg-gray-50 dark:bg-gray-800 rounded-md overflow-hidden ${isResizing ? 'select-none' : ''}`}
      style={{ minHeight: '96px', maxHeight: '800px' }}
    >
      <div className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-700 border-b flex justify-between items-center">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          Logs
        </h4>
        <div className="flex items-center gap-4">
          {(isLoading || isLoadingMore.current) && (
            <RotateCw className="w-3 h-3 animate-spin text-blue-500" />
          )}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {websocketLogs.length > 0 ? (
              <>
                {allLogs.length} of {totalLogCount} entries
                {analysis.status === 'running' ? (
                  <span className="ml-2 text-green-600 dark:text-green-400">
                    ● Live
                  </span>
                ) : (
                  <span className="ml-2 text-red-600 dark:text-red-400">
                    ● Stopped
                  </span>
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
          <div className="flex items-center justify-center text-gray-500 dark:text-gray-400">
            <RotateCw className="w-4 h-4 animate-spin mr-2" />
            Loading logs...
          </div>
        ) : allLogs.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No logs available.
          </p>
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
                  className="flex hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded"
                >
                  <span className="text-gray-500 dark:text-gray-400 mr-2 shrink-0">
                    {log.timestamp}
                  </span>
                  <span
                    className={`${
                      log.message?.toLowerCase().includes('error')
                        ? 'text-red-600 dark:text-red-400'
                        : log.message?.toLowerCase().includes('warn')
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
            {hasMore && !isLoading && (
              <div className="text-center py-2 text-sm text-gray-500 dark:text-gray-400">
                {isLoadingMore.current ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin inline mr-2" />
                    Loading more...
                  </>
                ) : (
                  <button
                    onClick={loadMoreLogs}
                    className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
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
          h-2 bg-gray-100 dark:bg-gray-700 border-t cursor-row-resize hover:bg-gray-200 dark:hover:bg-gray-600
          flex items-center justify-center
          ${isResizing ? 'bg-gray-300 dark:bg-gray-500' : ''}
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
        <div className="w-16 h-1 bg-gray-300 dark:bg-gray-500 rounded-full" />
      </div>
    </div>
  );
};

AnalysisLogs.propTypes = {
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
    status: PropTypes.string,
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
