import { useState } from 'react';
import { useWebSocket } from '../../contexts/websocketContext';
import AnalysisItem from './analysisItem';
import { Loader2 } from 'lucide-react';

export default function AnalysisList() {
  const { analyses = [], loadingAnalyses, connectionStatus } = useWebSocket();
  const [openLogIds, setOpenLogIds] = useState(new Set());

  const toggleAllLogs = () => {
    if (openLogIds.size === analyses.length) {
      setOpenLogIds(new Set());
    } else {
      setOpenLogIds(new Set(analyses.map((analysis) => analysis.name)));
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

  if (connectionStatus === 'connecting') {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Available Analyses</h2>
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <span>Connecting to server...</span>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </div>
    );
  }

  const hasAnalyses = Array.isArray(analyses) && analyses.length > 0;
  const hasLoadingAnalyses = loadingAnalyses.size > 0;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Available Analyses</h2>
        {hasAnalyses && (
          <button
            onClick={toggleAllLogs}
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            {openLogIds.size === analyses.length
              ? 'Close All Logs'
              : 'Open All Logs'}
          </button>
        )}
      </div>
      <div className="space-y-4">
        {/* Loading analyses */}
        {Array.from(loadingAnalyses).map((analysisName) => (
          <div key={`loading-${analysisName}`} className="bg-gray-50 p-4 rounded border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <div>
                  <h3 className="font-medium text-gray-900">{analysisName}</h3>
                  <p className="text-sm text-gray-500">Processing upload...</p>
                </div>
              </div>
              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                Loading
              </span>
            </div>
          </div>
        ))}

        {/* Actual analyses */}
        {hasAnalyses ? (
          analyses.map((analysis) => (
            <AnalysisItem
              key={`${analysis.name}-${analysis.created || Date.now()}`}
              analysis={analysis}
              showLogs={openLogIds.has(analysis.name)}
              onToggleLogs={() => toggleLog(analysis.name)}
            />
          ))
        ) : (
          !hasLoadingAnalyses && (
            <div className="text-center text-gray-500">
              No analyses available. Upload one to get started.
            </div>
          )
        )}
      </div>
    </div>
  );
}