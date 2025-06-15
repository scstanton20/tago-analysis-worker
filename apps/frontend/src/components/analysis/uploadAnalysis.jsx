import { useState, useRef, useEffect } from 'react';
import { analysisService } from '../../services/analysisService';
import { useWebSocket } from '../../contexts/websocketContext/index';
import Editor from '@monaco-editor/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import sanitize from 'sanitize-filename';

const DEFAULT_EDITOR_CONTENT = '// Write your analysis code here';

export default function AnalysisCreator({
  targetDepartment = null,
  departmentName = null,
  onClose = null,
}) {
  // Form state
  const [mode, setMode] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [analysisType] = useState('listener');
  const [analysisName, setAnalysisName] = useState('');
  const [editableFileName, setEditableFileName] = useState('');
  const [editorContent, setEditorContent] = useState(DEFAULT_EDITOR_CONTENT);
  const [formTouched, setFormTouched] = useState(false);

  // UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState(null);
  const [fetchedAnalyses, setFetchedAnalyses] = useState([]);
  const [isFetchingAnalyses, setIsFetchingAnalyses] = useState(false);

  // Refs
  const fileInputRef = useRef(null);

  // WebSocket context
  const {
    connectionStatus,
    addLoadingAnalysis,
    removeLoadingAnalysis,
    loadingAnalyses,
    analyses,
  } = useWebSocket();

  // Computed values
  const existingAnalyses = analyses
    ? analyses.map((analysis) => analysis.name)
    : [];
  const finalExistingAnalyses =
    existingAnalyses.length > 0 ? existingAnalyses : fetchedAnalyses;
  const currentAnalysisName =
    mode === 'upload' ? editableFileName : analysisName;
  const isCurrentAnalysisLoading =
    currentAnalysisName && loadingAnalyses.has(currentAnalysisName);
  const isConnected = connectionStatus === 'connected';

  // Form validation and state checks
  const isInputDisabled = isCurrentAnalysisLoading || !isConnected;
  const hasFormContent =
    selectedFile ||
    editorContent !== DEFAULT_EDITOR_CONTENT ||
    analysisName ||
    editableFileName;
  const showCancelButton = formTouched || hasFormContent || error;
  const isSaveDisabled =
    isCurrentAnalysisLoading ||
    !isConnected ||
    (mode === 'create' && !analysisName) ||
    (mode === 'upload' && (!selectedFile || !editableFileName)) ||
    error;
  const isTabDisabled = hasFormContent && !isCurrentAnalysisLoading;

  // Effects
  useEffect(() => {
    const fetchAnalyses = async () => {
      if (isExpanded && (!analyses || analyses.length === 0)) {
        setIsFetchingAnalyses(true);
        try {
          const data = await analysisService.getAnalyses();
          setFetchedAnalyses(data.map((analysis) => analysis.name));
        } catch (error) {
          console.error('Error fetching analyses:', error);
        } finally {
          setIsFetchingAnalyses(false);
        }
      }
    };
    fetchAnalyses();
  }, [isExpanded, analyses]);

  // Validation
  const validateFilename = (filename) => {
    if (!filename) return 'Filename cannot be empty';

    if (filename.includes('.')) {
      return 'Filename cannot contain periods. Extension will be added automatically.';
    }

    const sanitized = sanitize(filename, { replacement: '_' });
    if (filename !== sanitized) {
      return 'Filename contains invalid characters. Please remove: < > : " / \\ | ? * and control characters';
    }

    if (filename.trim() !== filename) {
      return 'Filename cannot start or end with spaces';
    }

    if (filename.length > 200) {
      return 'Filename is too long (max 200 characters)';
    }

    // Check for duplicate names (case-insensitive)
    const existingNamesLower = finalExistingAnalyses.map((name) =>
      name.toLowerCase(),
    );
    if (existingNamesLower.includes(filename.toLowerCase())) {
      const existingName = finalExistingAnalyses.find(
        (name) => name.toLowerCase() === filename.toLowerCase(),
      );
      return `An analysis with this name already exists${
        existingName !== filename ? ` (as "${existingName}")` : ''
      }. Please choose a different name.`;
    }

    return null;
  };

  // Event handlers
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFormTouched(true);

    if (!file.name.endsWith('.js') && !file.name.endsWith('.cjs')) {
      setError('Please select a JavaScript file (.js or .cjs)');
      resetFileSelection();
      return;
    }

    const nameWithoutExtension = file.name.replace(/\.(js|cjs)$/, '');
    const validationError = validateFilename(nameWithoutExtension);

    if (validationError) {
      setError(validationError);
      resetFileSelection();
      return;
    }

    setError(null);
    setSelectedFile(file);
    setEditableFileName(nameWithoutExtension);
    setAnalysisName(nameWithoutExtension);
  };

  const handleEditableFileNameChange = (e) => {
    const value = e.target.value;
    setFormTouched(true);
    setEditableFileName(value);
    setError(validateFilename(value));
  };

  const handleAnalysisNameChange = (e) => {
    const value = e.target.value;
    setFormTouched(true);
    setAnalysisName(value);
    setError(validateFilename(value));
  };

  const handleEditorChange = (value) => {
    setEditorContent(value);
    if (value !== DEFAULT_EDITOR_CONTENT) {
      setFormTouched(true);
    }
  };

  const handleModeChange = (newMode) => {
    if (isTabDisabled && mode !== newMode) return;
    setMode(newMode);
  };

  const handleToggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);

    if (!newExpanded) {
      resetForm();
    }
  };

  const handleUpload = async () => {
    if (mode === 'create' && !analysisName) {
      setError('Please provide a name for the analysis');
      return;
    }

    const finalFileName = mode === 'upload' ? editableFileName : analysisName;
    const validationError = validateFilename(finalFileName);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    try {
      let file;
      if (mode === 'upload') {
        file = new File([selectedFile], finalFileName, {
          type: selectedFile.type,
        });
      } else {
        const blob = new Blob([editorContent], { type: 'text/javascript' });
        file = new File([blob], finalFileName, { type: 'text/javascript' });
      }

      addLoadingAnalysis(finalFileName);

      // Pass the targetDepartment to the service
      await analysisService.uploadAnalysis(
        file,
        analysisType,
        targetDepartment,
      );

      window.alert(
        `Successfully ${mode === 'upload' ? 'uploaded' : 'created'} analysis ${finalFileName}${
          departmentName && departmentName !== 'All Departments'
            ? ` in ${departmentName}`
            : ''
        }`,
      );

      resetForm();

      // If onClose was provided, close the component
      if (onClose) {
        onClose();
      }
    } catch (error) {
      if (finalFileName) {
        removeLoadingAnalysis(finalFileName);
      }
      setError(error.message || 'Failed to save analysis');
      console.error('Save failed:', error);
    }
  };

  const handleCancel = () => {
    resetForm();
  };

  // Utility functions
  const resetForm = () => {
    setSelectedFile(null);
    setEditableFileName('');
    setAnalysisName('');
    setEditorContent(DEFAULT_EDITOR_CONTENT);
    setError(null);
    setFormTouched(false);
    setIsExpanded(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetFileSelection = () => {
    setSelectedFile(null);
    setEditableFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
    }
  };

  // Render helpers
  const renderTabButton = (tabMode, label) => (
    <button
      onClick={() => handleModeChange(tabMode)}
      className={`py-4 px-1 border-b-2 font-medium text-sm ${
        mode === tabMode
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500'
      } ${
        isTabDisabled && mode !== tabMode
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:text-gray-700 hover:border-gray-300'
      }`}
      disabled={isTabDisabled && mode !== tabMode}
    >
      {label}
    </button>
  );

  const renderUploadMode = () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <input
          type="file"
          onChange={handleFileChange}
          ref={fileInputRef}
          accept=".cjs"
          className="hidden"
          id="analysis-file"
          disabled={isInputDisabled}
        />
        <label
          htmlFor="analysis-file"
          className={`px-4 py-2 rounded cursor-pointer text-white ${
            isConnected
              ? 'bg-blue-500 hover:bg-blue-600'
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          Choose File
        </label>
        <span className="text-gray-600">
          {selectedFile ? selectedFile.name : 'No file chosen'}
        </span>
      </div>

      {selectedFile && (
        <div className="space-y-2">
          <label
            htmlFor="filename"
            className="block text-sm font-medium text-gray-700"
          >
            Edit Filename
          </label>
          <input
            type="text"
            id="filename"
            value={editableFileName}
            onChange={handleEditableFileNameChange}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
              error && error.includes('already exists')
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300'
            }`}
            placeholder="Enter filename (no extension)"
            disabled={isInputDisabled}
          />
        </div>
      )}

      <p className="text-sm text-gray-500">
        The .cjs extension will be added automatically by the backend as Tago.IO
        requires CommonJS modules.
      </p>
    </div>
  );

  const renderCreateMode = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="analysis-name"
          className="block text-sm font-medium text-gray-700"
        >
          Analysis Name
        </label>
        <input
          type="text"
          id="analysis-name"
          value={analysisName}
          onChange={handleAnalysisNameChange}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
            error && error.includes('already exists')
              ? 'border-red-300 bg-red-50'
              : 'border-gray-300'
          }`}
          placeholder="Enter analysis name (no extension)"
          disabled={isInputDisabled}
        />
        <p className="text-sm text-gray-500">
          The .cjs extension will be added automatically by the backend as
          Tago.IO requires CommonJS modules.
        </p>
        <p className="text-sm text-gray-500">
          You will be able to edit the environment variables after creation.
        </p>
      </div>

      <div className="h-96 border border-gray-300 rounded-md overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          value={editorContent}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontSize: 14,
            automaticLayout: true,
            wordWrap: 'on',
            lineNumbers: 'on',
            readOnly: isInputDisabled,
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-8 transition-colors relative">
      {/* Header */}
      <div
        className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
        onClick={handleToggleExpanded}
      >
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Analysis Creator
          {departmentName && departmentName !== 'All Departments' && (
            <span className="text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">
              - {departmentName}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {isExpanded && onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
            >
              ✕
            </button>
          )}
          <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-6 pt-2 border-t dark:border-gray-700">
          <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
              <nav className="-mb-px flex space-x-8">
                {renderTabButton('upload', 'Upload Existing File')}
                {renderTabButton('create', 'Create New Analysis')}
              </nav>
            </div>

            {/* Loading Indicator */}
            {isFetchingAnalyses && (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                Loading existing analyses...
              </div>
            )}

            {/* Mode Content */}
            {mode === 'upload' ? renderUploadMode() : renderCreateMode()}

            {/* Error Message */}
            {error && (
              <div className="text-red-500 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={handleUpload}
                disabled={isSaveDisabled}
                className={`px-4 py-2 rounded text-white ${
                  isSaveDisabled
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {isCurrentAnalysisLoading ? 'Processing...' : 'Save Analysis'}
              </button>

              {showCancelButton && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                  disabled={isInputDisabled}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Connection Status */}
          {!isConnected && (
            <div className="mt-4 p-2 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-200 rounded">
              Not connected to server. Please wait for connection to be
              established.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
