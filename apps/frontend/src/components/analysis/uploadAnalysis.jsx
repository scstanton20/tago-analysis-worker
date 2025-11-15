import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { analysisService } from '../../services/analysisService';
import { useAnalyses } from '../../contexts/sseContext/index';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useAsyncOperation } from '../../hooks/async/useAsyncOperation';
import {
  Stack,
  Group,
  Text,
  Button,
  TextInput,
  Tabs,
  Collapse,
  ActionIcon,
  Box,
  Select,
  Paper,
} from '@mantine/core';
import { FormAlert, ContentBox, LoadingState } from '../global';
import { Dropzone } from '@mantine/dropzone';
import {
  IconChevronDown,
  IconChevronUp,
  IconUpload,
  IconX,
  IconFolderPlus,
  IconFileCode,
} from '@tabler/icons-react';

// Lazy load CodeMirror editor to reduce initial bundle size
const CodeMirrorEditor = lazy(() =>
  import('../editor/CodeMirrorEditor.jsx').then((m) => ({
    default: m.CodeMirrorEditor,
  })),
);

const DEFAULT_EDITOR_CONTENT = '// Write your analysis code here';

export default function AnalysisCreator({ targetTeam = null, onClose = null }) {
  // Form state
  const [mode, setMode] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [analysisName, setAnalysisName] = useState('');
  const [editableFileName, setEditableFileName] = useState('');
  const [editorContent, setEditorContent] = useState(DEFAULT_EDITOR_CONTENT);
  const [formTouched, setFormTouched] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(null);

  // UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const uploadOperation = useAsyncOperation();

  // SSE context
  const { loadingAnalyses, analyses } = useAnalyses();

  // Permissions and team data
  const { getUploadableTeams, isAdmin } = usePermissions();

  // Notifications
  const notify = useNotifications();

  // Use SSE analyses data directly
  const existingAnalyses = analyses ? Object.keys(analyses) : [];
  const currentAnalysisName =
    mode === 'upload' ? editableFileName : analysisName;
  const isCurrentAnalysisLoading =
    currentAnalysisName &&
    (loadingAnalyses.has(currentAnalysisName) || uploadOperation.loading);

  // Get teams where user can upload
  const uploadableTeams = getUploadableTeams();

  const teamSelectData = uploadableTeams.map((team) => ({
    value: team.id,
    label: team.name,
  }));

  // Determine initial team selection
  const getInitialTeam = useCallback(() => {
    // If a target team is specified and user has access, use it
    if (targetTeam && uploadableTeams.some((team) => team.id === targetTeam)) {
      return targetTeam;
    }

    // Otherwise, pick the first available team
    return uploadableTeams.length > 0 ? uploadableTeams[0].id : null;
  }, [targetTeam, uploadableTeams]);

  // Set initial team selection when component mounts or permissions change (derived effect)
  useMemo(() => {
    if (!selectedTeamId) {
      const initialTeam = getInitialTeam();
      if (initialTeam) {
        setSelectedTeamId(initialTeam);
      }
    }
  }, [selectedTeamId, getInitialTeam]);

  // Form validation and state checks
  const isInputDisabled = isCurrentAnalysisLoading;

  const handleEditorChange = (newContent) => {
    setEditorContent(newContent);
    if (newContent !== DEFAULT_EDITOR_CONTENT) {
      setFormTouched(true);
    }
  };

  // If user has no upload permissions anywhere, don't show the component
  if (!isAdmin && uploadableTeams.length === 0) {
    return (
      <ContentBox radius="md" mb="lg">
        <FormAlert
          type="warning"
          message={
            <>
              <Text fw={500}>No Upload Permissions</Text>
              <Text size="sm" mt="xs">
                You don't have upload permissions for any teams. Contact an
                administrator to grant you upload access.
              </Text>
            </>
          }
        />
      </ContentBox>
    );
  }
  const hasFormContent =
    selectedFile ||
    editorContent !== DEFAULT_EDITOR_CONTENT ||
    analysisName ||
    editableFileName;
  const showCancelButton =
    formTouched || hasFormContent || uploadOperation.error;
  const isSaveDisabled =
    isCurrentAnalysisLoading ||
    (mode === 'create' && !analysisName) ||
    (mode === 'upload' && (!selectedFile || !editableFileName)) ||
    !selectedTeamId ||
    uploadOperation.error;
  const isTabDisabled = hasFormContent && !isCurrentAnalysisLoading;

  // Validation
  const validateFilename = async (filename) => {
    if (!filename) return 'Filename cannot be empty';

    if (filename.includes('.')) {
      return 'Filename cannot contain periods. Extension will be added automatically.';
    }

    // Dynamically import sanitize-filename only when needed
    const { default: sanitize } = await import('sanitize-filename');
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
    const existingNamesLower = existingAnalyses.map((name) =>
      name.toLowerCase(),
    );
    if (existingNamesLower.includes(filename.toLowerCase())) {
      const existingName = existingAnalyses.find(
        (name) => name.toLowerCase() === filename.toLowerCase(),
      );
      return `An analysis with this name already exists${
        existingName !== filename ? ` (as "${existingName}")` : ''
      }. Please choose a different name.`;
    }

    return null;
  };

  // Event handlers
  const handleFileChange = async (file) => {
    if (!file) {
      resetFileSelection();
      return;
    }

    setFormTouched(true);

    if (!file.name.endsWith('.js') && !file.name.endsWith('.js')) {
      uploadOperation.setError('Please select a JavaScript file (.js)');
      resetFileSelection();
      return;
    }

    const nameWithoutExtension = file.name.replace(/\.(js|cjs)$/, '');
    const validationError = await validateFilename(nameWithoutExtension);

    if (validationError) {
      uploadOperation.setError(validationError);
      resetFileSelection();
      return;
    }

    uploadOperation.setError(null);
    setSelectedFile(file);
    setEditableFileName(nameWithoutExtension);
    setAnalysisName(nameWithoutExtension);
  };

  const handleEditableFileNameChange = async (e) => {
    const value = e.target.value;
    setFormTouched(true);
    setEditableFileName(value);
    uploadOperation.setError(await validateFilename(value));
  };

  const handleAnalysisNameChange = async (e) => {
    const value = e.target.value;
    setFormTouched(true);
    setAnalysisName(value);
    uploadOperation.setError(await validateFilename(value));
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

  const handleTeamChange = (teamId) => {
    setSelectedTeamId(teamId);
    setFormTouched(true);
  };

  const handleUpload = async () => {
    if (mode === 'create' && !analysisName) {
      uploadOperation.setError('Please provide a name for the analysis');
      return;
    }

    const finalFileName = mode === 'upload' ? editableFileName : analysisName;
    const validationError = await validateFilename(finalFileName);

    if (validationError) {
      uploadOperation.setError(validationError);
      return;
    }

    await uploadOperation.execute(async () => {
      let file;
      if (mode === 'upload') {
        file = new File([selectedFile], finalFileName, {
          type: selectedFile.type,
        });
      } else {
        const blob = new Blob([editorContent], { type: 'text/javascript' });
        file = new File([blob], finalFileName, { type: 'text/javascript' });
      }

      await notify.uploadAnalysis(
        analysisService.uploadAnalysis(file, selectedTeamId),
        finalFileName,
      );

      resetForm();

      // If onClose was provided, close the component
      if (onClose) {
        onClose();
      }
    });
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
    uploadOperation.setError(null);
    setFormTouched(false);
    setIsExpanded(false);
    setSelectedTeamId(getInitialTeam());
  };

  const resetFileSelection = () => {
    setSelectedFile(null);
    setEditableFileName('');
  };

  return (
    <Paper withBorder radius="md" mb="lg" pos="relative">
      {/* Header */}
      <Box
        p="md"
        styles={{
          root: {
            cursor: 'pointer',
            transition: 'background-color 200ms',
            '&:hover': {
              backgroundColor: 'var(--mantine-color-gray-light)',
            },
          },
        }}
        onClick={handleToggleExpanded}
      >
        <Group justify="space-between">
          <Box>
            <Text size="lg" fw={600}>
              Analysis Creator
            </Text>
          </Box>
          <Group gap="xs">
            {isExpanded && onClose && (
              <ActionIcon
                variant="subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
              >
                <IconX size={20} />
              </ActionIcon>
            )}
            <ActionIcon variant="subtle" color="brand">
              {isExpanded ? (
                <IconChevronUp size={20} />
              ) : (
                <IconChevronDown size={20} />
              )}
            </ActionIcon>
          </Group>
        </Group>
      </Box>

      {/* Expanded Content */}
      <Collapse in={isExpanded}>
        <Box
          p="lg"
          pt={0}
          style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
        >
          <Stack>
            {/* Mode Toggle */}
            <Tabs value={mode} onChange={handleModeChange}>
              <Tabs.List>
                <Tabs.Tab
                  value="upload"
                  disabled={isTabDisabled && mode !== 'upload'}
                >
                  Upload Existing File
                </Tabs.Tab>
                <Tabs.Tab
                  value="create"
                  disabled={isTabDisabled && mode !== 'create'}
                >
                  Create New Analysis
                </Tabs.Tab>
              </Tabs.List>

              {/* Team Selector - shown for all modes */}
              <Box pt="md">
                <Select
                  label="Target Team"
                  placeholder="Select a team"
                  value={selectedTeamId}
                  onChange={handleTeamChange}
                  data={teamSelectData}
                  disabled={isInputDisabled}
                  leftSection={<IconFolderPlus size={16} />}
                  description="Choose which team this analysis will belong to"
                />
              </Box>

              <Tabs.Panel value="upload" pt="md">
                <Stack>
                  <Box>
                    <Text size="sm" fw={500} mb="xs">
                      Select JavaScript file
                    </Text>
                    <Dropzone
                      accept={{
                        'text/javascript': ['.js'],
                        'application/x-javascript': ['.js'],
                      }}
                      onDrop={(files) => handleFileChange(files[0])}
                      onReject={() => {
                        uploadOperation.setError(
                          'Please select a JavaScript file (.js)',
                        );
                        setFormTouched(true);
                      }}
                      maxFiles={1}
                      disabled={isInputDisabled}
                      styles={{
                        root: {
                          borderColor: selectedFile
                            ? 'var(--mantine-color-green-5)'
                            : undefined,
                          backgroundColor: selectedFile
                            ? 'var(--mantine-color-green-light)'
                            : undefined,
                        },
                      }}
                    >
                      <Group
                        justify="center"
                        gap="xl"
                        mih={120}
                        style={{ pointerEvents: 'none' }}
                      >
                        <Dropzone.Accept>
                          <IconUpload
                            style={{
                              width: 52,
                              height: 52,
                              color: 'var(--mantine-color-blue-6)',
                            }}
                            stroke={1.5}
                          />
                        </Dropzone.Accept>
                        <Dropzone.Reject>
                          <IconX
                            style={{
                              width: 52,
                              height: 52,
                              color: 'var(--mantine-color-red-6)',
                            }}
                            stroke={1.5}
                          />
                        </Dropzone.Reject>
                        <Dropzone.Idle>
                          {selectedFile ? (
                            <IconFileCode
                              style={{
                                width: 52,
                                height: 52,
                                color: 'var(--mantine-color-green-6)',
                              }}
                              stroke={1.5}
                            />
                          ) : (
                            <IconFileCode
                              style={{
                                width: 52,
                                height: 52,
                                color: 'var(--mantine-color-dimmed)',
                              }}
                              stroke={1.5}
                            />
                          )}
                        </Dropzone.Idle>

                        <div>
                          <Text size="xl" inline>
                            {selectedFile
                              ? `Selected: ${selectedFile.name}`
                              : 'Drag JavaScript files here or click to select'}
                          </Text>
                          <Text size="sm" c="dimmed" inline mt={7}>
                            Attach .js files only
                          </Text>
                        </div>
                      </Group>
                    </Dropzone>
                  </Box>

                  {selectedFile && (
                    <TextInput
                      label="Edit Filename"
                      value={editableFileName}
                      onChange={handleEditableFileNameChange}
                      placeholder="Enter filename (no extension)"
                      disabled={isInputDisabled}
                      error={
                        uploadOperation.error &&
                        uploadOperation.error.includes('already exists')
                      }
                    />
                  )}

                  <Text size="sm" c="dimmed">
                    If not already included, the .js extension will be added by
                    the backend as TagoIO requires ES modules.
                  </Text>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="create" pt="md">
                <Stack>
                  <TextInput
                    label="Analysis Name"
                    value={analysisName}
                    onChange={handleAnalysisNameChange}
                    placeholder="Enter analysis name (no extension)"
                    disabled={isInputDisabled}
                    error={
                      uploadOperation.error &&
                      uploadOperation.error.includes('already exists')
                    }
                  />

                  <Text size="sm" c="dimmed">
                    The .js extension will be added by the backend as TagoIO
                    requires ES modules.
                  </Text>

                  <Text size="sm" c="dimmed">
                    You will be able to edit the environment variables after
                    creation.
                  </Text>

                  <Box
                    h={384}
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 'var(--mantine-radius-md)',
                      overflow: 'hidden',
                    }}
                  >
                    {mode === 'create' && isExpanded && (
                      <Suspense
                        fallback={
                          <LoadingState loading={true} minHeight={400} />
                        }
                      >
                        <CodeMirrorEditor
                          value={editorContent}
                          onChange={handleEditorChange}
                          readOnly={isInputDisabled}
                          language="javascript"
                          height="100%"
                        />
                      </Suspense>
                    )}
                  </Box>
                </Stack>
              </Tabs.Panel>
            </Tabs>

            {/* Error Message */}
            <FormAlert type="error" message={uploadOperation.error} />

            {/* Action Buttons */}
            <Group>
              <Button
                onClick={handleUpload}
                disabled={isSaveDisabled}
                loading={isCurrentAnalysisLoading}
                color="green"
              >
                Save Analysis
              </Button>

              {showCancelButton && (
                <Button
                  variant="default"
                  onClick={handleCancel}
                  disabled={isInputDisabled}
                >
                  Cancel
                </Button>
              )}
            </Group>
          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
}

AnalysisCreator.propTypes = {
  targetTeam: PropTypes.string,
  onClose: PropTypes.func,
};
