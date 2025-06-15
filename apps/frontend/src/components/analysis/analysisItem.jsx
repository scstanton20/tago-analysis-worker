import { useState, useContext } from 'react';
import PropTypes from 'prop-types';
import {
  Play,
  Square,
  FileText,
  Download,
  Edit,
  Trash2,
  MoreVertical,
  FolderPlus,
  FolderEdit,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { analysisService } from '../../services/analysisService';
import AnalysisLogs from './analysisLogs';
import StatusBadge from '../common/statusBadge';
import EditAnalysisModal from './analysisEdit';
import EditAnalysisENVModal from './analysisEditENV';
import LogDownloadDialog from './logDownload';
import DepartmentSelectModal from './departmentSelectModal';
import { WebSocketContext } from '../../contexts/websocketContext';
import { useWebSocket } from '../../contexts/websocketContext';

export default function AnalysisItem({ analysis, showLogs, onToggleLogs }) {
  const [showEditAnalysisModal, setShowEditAnalysisModal] = useState(false);
  const [showEditENVModal, setShowEditENVModal] = useState(false);
  const [showLogDownloadDialog, setShowLogDownloadDialog] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);

  const { loadingAnalyses, addLoadingAnalysis, removeLoadingAnalysis } =
    useContext(WebSocketContext);
  const { departments } = useWebSocket();
  const isLoading = loadingAnalyses.has(analysis.name);

  if (!analysis || !analysis.name) {
    return null;
  }

  // Get current department info
  const departmentsArray = Array.isArray(departments)
    ? departments
    : Object.values(departments || {});
  const currentDepartment = departmentsArray.find(
    (d) => d.id === analysis.department,
  );
  const isUncategorized =
    !analysis.department || analysis.department === 'uncategorized';

  const handleRun = async () => {
    addLoadingAnalysis(analysis.name);
    try {
      await analysisService.runAnalysis(analysis.name);
    } catch (error) {
      console.error('Failed to run analysis:', error);
      removeLoadingAnalysis(analysis.name);
    }
  };

  const handleStop = async () => {
    addLoadingAnalysis(analysis.name);
    try {
      await analysisService.stopAnalysis(analysis.name);
    } catch (error) {
      console.error('Failed to stop analysis:', error);
      removeLoadingAnalysis(analysis.name);
    }
  };

  const handleDeleteAnalysis = async () => {
    if (!window.confirm('Are you sure you want to delete this analysis?')) {
      return;
    }

    try {
      await analysisService.deleteAnalysis(analysis.name);
    } catch (error) {
      console.error('Failed to delete analysis:', error);
    }
  };

  const handleSaveAnalysis = async (content) => {
    try {
      await analysisService.updateAnalysis(analysis.name, content);
      setShowEditAnalysisModal(false);
    } catch (error) {
      console.error('Failed to save analysis:', error);
      throw error;
    }
  };

  const handleSaveENV = async (content) => {
    try {
      await analysisService.updateAnalysisENV(analysis.name, content);
      setShowEditENVModal(false);
    } catch (error) {
      console.error('Failed to save analysis:', error);
      throw error;
    }
  };

  const handleDownloadLogs = async (timeRange) => {
    try {
      await analysisService.downloadLogs(analysis.name, timeRange);
    } catch (error) {
      console.error('Failed to download logs:', error);
    }
  };

  const handleDeleteLogs = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete all logs for this analysis?',
      )
    ) {
      return;
    }

    try {
      if (showLogs) {
        onToggleLogs();
      }

      await analysisService.deleteLogs(analysis.name);

      // Wait for the backend to fully process the deletion
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!showLogs) {
        onToggleLogs();
      }
    } catch (error) {
      console.error('Failed to delete logs:', error);
    }
  };

  const handleDownloadAnalysis = async () => {
    try {
      await analysisService.downloadAnalysis(analysis.name);
    } catch (error) {
      console.error('Failed to download analysis:', error);
    }
  };

  const handleDepartmentChange = async (departmentId) => {
    try {
      const response = await fetch(
        `/api/departments/analyses/${analysis.name}/department`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departmentId }),
        },
      );

      if (response.ok) {
        console.log(
          `Moved analysis ${analysis.name} to department ${departmentId}`,
        );
        setShowDepartmentModal(false);
      } else {
        throw new Error('Failed to move analysis');
      }
    } catch (error) {
      console.error('Error moving analysis:', error);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {analysis.name}
            </h3>
            <StatusBadge status={analysis.status || 'stopped'} />
            {/* Department indicator */}
            {currentDepartment && (
              <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: currentDepartment.color }}
                />
                <span className="text-gray-600 dark:text-gray-300">
                  {currentDepartment.name}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Primary Actions */}
          <div className="flex items-center space-x-2">
            {analysis.status === 'running' ? (
              <button
                onClick={handleStop}
                disabled={isLoading}
                className="flex items-center gap-1 bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 disabled:bg-red-300"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={isLoading}
                className="flex items-center gap-1 bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 disabled:bg-green-300"
              >
                <Play className="w-4 h-4" />
                Run
              </button>
            )}
          </div>

          {/* Log Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onToggleLogs}
              className="flex items-center gap-1 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
            >
              <FileText className="w-4 h-4" />
              {showLogs ? 'Hide Logs' : 'Show Logs'}
            </button>
          </div>

          {/* Secondary Actions Dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[200px] bg-white dark:bg-gray-800 rounded-md shadow-lg border dark:border-gray-700 p-1 z-50"
                sideOffset={5}
              >
                {/* Department Management */}
                <DropdownMenu.Item
                  onClick={() => setShowDepartmentModal(true)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                >
                  {isUncategorized ? (
                    <>
                      <FolderPlus className="w-4 h-4" />
                      Add to Department
                    </>
                  ) : (
                    <>
                      <FolderEdit className="w-4 h-4" />
                      Change Department
                    </>
                  )}
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-600 my-1" />

                {/* File Operations */}
                <DropdownMenu.Item
                  onClick={() => handleDownloadAnalysis()}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                >
                  <Download className="w-4 h-4" />
                  Download Analysis File
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={() => setShowLogDownloadDialog(true)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                >
                  <Download className="w-4 h-4" />
                  Download Logs
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-600 my-1" />

                {/* Edit Operations */}
                <DropdownMenu.Item
                  onClick={() => setShowEditAnalysisModal(true)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                >
                  <Edit className="w-4 h-4" />
                  Edit Analysis
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onClick={() => setShowEditENVModal(true)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                >
                  <Edit className="w-4 h-4" />
                  Edit Environment
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-600 my-1" />

                {/* Destructive Operations */}
                <DropdownMenu.Item
                  onClick={handleDeleteLogs}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-red-600 dark:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear/Delete All Logs
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onClick={handleDeleteAnalysis}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-red-600 dark:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Analysis
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Logs Section */}
      {showLogs && <AnalysisLogs analysis={analysis} />}

      {/* Modals */}
      {showEditAnalysisModal && (
        <EditAnalysisModal
          analysis={analysis}
          onClose={() => setShowEditAnalysisModal(false)}
          onSave={handleSaveAnalysis}
        />
      )}
      {showEditENVModal && (
        <EditAnalysisENVModal
          analysis={analysis}
          onClose={() => setShowEditENVModal(false)}
          onSave={handleSaveENV}
        />
      )}
      <LogDownloadDialog
        isOpen={showLogDownloadDialog}
        onClose={() => setShowLogDownloadDialog(false)}
        onDownload={handleDownloadLogs}
      />
      {showDepartmentModal && (
        <DepartmentSelectModal
          isOpen={showDepartmentModal}
          onClose={() => setShowDepartmentModal(false)}
          onSelect={handleDepartmentChange}
          departments={departmentsArray}
          currentDepartment={analysis.department}
          analysisName={analysis.name}
        />
      )}
    </div>
  );
}

AnalysisItem.propTypes = {
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['listener']),
    status: PropTypes.string,
    department: PropTypes.string,
    logs: PropTypes.arrayOf(
      PropTypes.shape({
        timestamp: PropTypes.string,
        message: PropTypes.string,
      }),
    ),
  }).isRequired,
  showLogs: PropTypes.bool.isRequired,
  onToggleLogs: PropTypes.func.isRequired,
  departmentInfo: PropTypes.shape({
    name: PropTypes.string,
    color: PropTypes.string,
  }),
};
