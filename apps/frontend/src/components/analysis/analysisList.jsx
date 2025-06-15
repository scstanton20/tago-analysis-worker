import { useState } from 'react';
import { useWebSocket } from '../../contexts/websocketContext';
import AnalysisItem from './analysisItem';
import { Loader2 } from 'lucide-react';

export default function AnalysisList({
  analyses = null, // Accept filtered analyses as prop
  showDepartmentLabels = false,
  departments = [],
}) {
  const { analyses: allAnalyses = [], connectionStatus } = useWebSocket();
  const [openLogIds, setOpenLogIds] = useState(new Set());

  // Use provided analyses (filtered) or fall back to all analyses
  const analysesToShow =
    analyses !== null ? Object.values(analyses) : allAnalyses;

  const toggleAllLogs = () => {
    if (openLogIds.size === analysesToShow.length) {
      setOpenLogIds(new Set());
    } else {
      setOpenLogIds(new Set(analysesToShow.map((analysis) => analysis.name)));
    }
  };

  const toggleLog = (analysisName) => {
    setOpenLogIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(analysisName)) {
        newSet.delete(analysisName);
      } else {
        newSet.add(analysisName);
      }
      return newSet;
    });
  };

  // Helper function to get department info
  const getDepartmentInfo = (departmentId) => {
    const department = departments.find((d) => d.id === departmentId);
    return department || { name: 'Uncategorized', color: '#9ca3af' };
  };

  if (connectionStatus === 'connecting') {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Available Analyses
        </h2>
        <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
          <span>Connecting to server...</span>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </div>
    );
  }

  const hasAnalyses =
    Array.isArray(analysesToShow) && analysesToShow.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Available Analyses
          </h2>
          {hasAnalyses && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Showing {analysesToShow.length} analysis
              {analysesToShow.length !== 1 ? 'es' : ''}
            </p>
          )}
        </div>
        {hasAnalyses && (
          <button
            onClick={toggleAllLogs}
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors"
          >
            {openLogIds.size === analysesToShow.length
              ? 'Close All Logs'
              : 'Open All Logs'}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {hasAnalyses ? (
          analysesToShow.map((analysis) => {
            const departmentInfo = getDepartmentInfo(analysis.department);

            return (
              <div key={`${analysis.name}-${analysis.created || Date.now()}`}>
                {/* Department Label (if enabled) */}
                {showDepartmentLabels && (
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: departmentInfo.color }}
                    />
                    <span className="text-gray-600 dark:text-gray-400 font-medium">
                      {departmentInfo.name}
                    </span>
                  </div>
                )}

                {/* Analysis Item */}
                <AnalysisItem
                  analysis={analysis}
                  showLogs={openLogIds.has(analysis.name)}
                  onToggleLogs={() => toggleLog(analysis.name)}
                  departmentInfo={showDepartmentLabels ? departmentInfo : null}
                />
              </div>
            );
          })
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <div className="mb-2">
              {analyses !== null
                ? 'No analyses found in this department.'
                : 'No analyses available.'}
            </div>
            <div className="text-sm">
              {analyses !== null
                ? 'Try selecting a different department or create a new analysis.'
                : 'Upload one to get started.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
