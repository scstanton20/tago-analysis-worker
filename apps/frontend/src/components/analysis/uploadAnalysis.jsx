import { useState, useRef, useEffect } from 'react';
import { analysisService } from '../../services/analysisService';
import { useWebSocket } from '../../contexts/websocketContext/index';
import Editor from '@monaco-editor/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { statusService } from '../../services/statusServices';
import sanitize from 'sanitize-filename';

export default function AnalysisCreator() {
  const [mode, setMode] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [analysisType, setAnalysisType] = useState('listener');
  const [error, setError] = useState(null);
  const [analysisName, setAnalysisName] = useState('');
  const [editableFileName, setEditableFileName] = useState('');
  const [editorContent, setEditorContent] = useState(
    '// Write your analysis code here',
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef(null);
  const { connectionStatus, addLoadingAnalysis, removeLoadingAnalysis, loadingAnalyses } = useWebSocket();
  const [sdkVersion, setSdkVersion] = useState('');

  const validateFilename = (filename) => {
    if (!filename) return 'Filename cannot be empty';
    
    // Don't allow periods at all - backend will add extension
    if (filename.includes('.')) {
      return 'Filename cannot contain periods. Extension will be added automatically.';
    }
    
    const sanitized = sanitize(filename, { replacement: '_' });
    
    if (filename !== sanitized) {
      return 'Filename contains invalid characters. Please remove: < > : " / \\ | ? * and control characters';
    }
    
    // Additional checks that sanitize might miss  
    if (filename.trim() !== filename) {
      return 'Filename cannot start or end with spaces';
    }
    
    if (filename.length > 200) {
      return 'Filename is too long (max 200 characters)';
    }
    
    return null;
  };

  useEffect(() => {
    const fetchVersion = async () => {
      const status = await statusService.getSystemStatus();
      setSdkVersion(status.tagoConnection.sdkVersion);
    };
    fetchVersion();
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.endsWith('.js') && !file.name.endsWith('.cjs')) {
        setError('Please select a JavaScript file (.js or .cjs)');
        setSelectedFile(null);
        setEditableFileName('');
        event.target.value = null;
        return;
      }

      // Strip extension from filename for editing
      const nameWithoutExtension = file.name.replace(/\.(js|cjs)$/, '');
      const validationError = validateFilename(nameWithoutExtension);
      if (validationError) {
        setError(validationError);
        setSelectedFile(null);
        setEditableFileName('');
        event.target.value = null;
        return;
      }

      setError(null);
      setSelectedFile(file);
      setEditableFileName(nameWithoutExtension);
      setAnalysisName(nameWithoutExtension);
    }
  };

  const handleEditableFileNameChange = (e) => {
    const value = e.target.value;
    setEditableFileName(value);
    
    const validationError = validateFilename(value);
    setError(validationError);
  };

  const handleAnalysisNameChange = (e) => {
    const value = e.target.value;
    setAnalysisName(value);
    
    const validationError = validateFilename(value);
    setError(validationError);
  };

  const handleUpload = async () => {
    console.log('handleUpload called');
    
    if (mode === 'create' && !analysisName) {
      setError('Please provide a name for the analysis');
      return;
    }

    // Validate filenames before submission
    let finalFileName;
    let validationError;
    
    if (mode === 'upload') {
      if (!selectedFile || !editableFileName) return;
      validationError = validateFilename(editableFileName);
      if (validationError) {
        setError(validationError);
        return;
      }
      finalFileName = editableFileName;
    } else {
      if (!analysisName) return;
      validationError = validateFilename(analysisName);
      if (validationError) {
        setError(validationError);
        return;
      }
      finalFileName = `${analysisName}`;
    }

    setError(null);

    let file;

    try {
      if (mode === 'upload') {
        file = new File([selectedFile], finalFileName, {
          type: selectedFile.type,
        });
      } else {
        const blob = new Blob([editorContent], { type: 'text/javascript' });
        file = new File([blob], finalFileName, { type: 'text/javascript' });
      }

      // Add to loading state immediately
      console.log('Adding to loading state:', finalFileName);
      addLoadingAnalysis(finalFileName);

      console.log('Calling analysisService.uploadAnalysis');
      await analysisService.uploadAnalysis(file, analysisType);

      window.alert(
        `Successfully ${mode === 'upload' ? 'uploaded' : 'created'} analysis ${finalFileName}`,
      );

      // Reset form
      setSelectedFile(null);
      setEditableFileName('');
      setEditorContent('// Write your analysis code here');
      setAnalysisName('');
      setIsExpanded(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.log('Upload error, removing from loading state:', finalFileName);
      // Remove from loading state on error
      if (finalFileName) {
        removeLoadingAnalysis(finalFileName);
      }
      
      setError(error.message || 'Failed to save analysis');
      console.error('Save failed:', error);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setEditableFileName('');
    setError(null);
    setAnalysisName('');
    setEditorContent('// Write your analysis code here');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Check if current analysis is being processed
  const getCurrentAnalysisName = () => {
    return mode === 'upload' ? editableFileName : `${analysisName}`;
  };

  const isCurrentAnalysisLoading = () => {
    const currentName = getCurrentAnalysisName();
    const isLoading = currentName && loadingAnalyses.has(currentName);
    console.log('isCurrentAnalysisLoading check:', { currentName, isLoading, loadingAnalyses: Array.from(loadingAnalyses) });
    return isLoading;
  };

  const isDisabled =
    isCurrentAnalysisLoading() ||
    connectionStatus !== 'connected' ||
    (mode === 'create' && !analysisName) ||
    (mode === 'upload' && !selectedFile) ||
    error;

  const isTabDisabled =
    (selectedFile || editorContent !== '// Write your analysis code here') &&
    !isCurrentAnalysisLoading();

  return (
    <>
      <div className="bg-white rounded-lg shadow-md mb-8">
        <div
          className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h2 className="text-xl font-semibold">Analysis Creator</h2>
          <button className="text-gray-500 hover:text-gray-700">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="p-6 pt-2 border-t">
            <div className="space-y-4">
              {/* Mode Toggle */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => !isTabDisabled && setMode('upload')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      mode === 'upload'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500'
                    } ${
                      isTabDisabled && mode !== 'upload'
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:text-gray-700 hover:border-gray-300'
                    }`}
                    disabled={isTabDisabled && mode !== 'upload'}
                  >
                    Upload Existing File
                  </button>
                  <button
                    onClick={() => !isTabDisabled && setMode('create')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      mode === 'create'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500'
                    } ${
                      isTabDisabled && mode !== 'create'
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:text-gray-700 hover:border-gray-300'
                    }`}
                    disabled={isTabDisabled && mode !== 'create'}
                  >
                    Create New Analysis
                  </button>
                </nav>
              </div>

              {/* Analysis Name - Only shown in create mode */}
              {mode === 'create' && (
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter analysis name (no extension)"
                    disabled={isCurrentAnalysisLoading()}
                  />
                  <p className="text-sm text-gray-500">
                    The backend will automatically add a .cjs extension since Tago.IO requires CommonJS modules.
                  </p>
                  <p className="text-sm text-gray-500">
                    You will be able to edit the environment variables after
                    creation.
                  </p>
                </div>
              )}

              {mode === 'upload' ? (
                /* File Upload UI */
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      ref={fileInputRef}
                      accept=".js,.cjs"
                      className="hidden"
                      id="analysis-file"
                      disabled={isDisabled}
                    />
                    <label
                      htmlFor="analysis-file"
                      className={`px-4 py-2 rounded cursor-pointer text-white ${
                        connectionStatus === 'connected'
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

                  {/* Editable filename field */}
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter filename (no extension)"
                        disabled={isCurrentAnalysisLoading()}
                      />
                      <p className="text-sm text-gray-500">
                        The .cjs extension will be added automatically by the backend.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* Editor UI */
                <div className="h-96 border border-gray-300 rounded-md overflow-hidden">
                  <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    value={editorContent}
                    onChange={setEditorContent}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: true },
                      scrollBeyondLastLine: false,
                      fontSize: 14,
                      automaticLayout: true,
                      wordWrap: 'on',
                      lineNumbers: 'on',
                      readOnly: isCurrentAnalysisLoading(),
                    }}
                  />
                </div>
              )}

              {/* Analysis Type Selection */}
              <div className="flex items-center space-x-6">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="analysisType"
                    value="listener"
                    checked={analysisType === 'listener'}
                    onChange={(e) => setAnalysisType(e.target.value)}
                    className="form-radio text-blue-500"
                    disabled={isCurrentAnalysisLoading()}
                  />
                  <span>Connect via Tago SDK {sdkVersion}</span>
                </label>
              </div>

              {/* Error Message */}
              {error && <div className="text-red-500 text-sm">{error}</div>}

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  onClick={handleUpload}
                  disabled={isDisabled}
                  className={`px-4 py-2 rounded text-white ${
                    isDisabled
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  {isCurrentAnalysisLoading() ? 'Processing...' : 'Save Analysis'}
                </button>
                {(selectedFile ||
                  editorContent !== '// Write your analysis code here') && (
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 rounded text-gray-600 hover:text-gray-800"
                    disabled={isCurrentAnalysisLoading()}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Connection Status */}
            {connectionStatus !== 'connected' && (
              <div className="mt-4 p-2 bg-yellow-100 text-yellow-700 rounded">
                Not connected to server. Please wait for connection to be
                established.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}