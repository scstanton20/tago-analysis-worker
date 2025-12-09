import { useMemo, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import sanitize from 'sanitize-filename';
import { analysisService } from '../../services/analysisService';
import { useAnalyses } from '../../contexts/sseContext/index';
import { notificationAPI } from '../../utils/notificationAPI.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useStandardForm } from '../../hooks/forms/useStandardForm';
import {
  Stack,
  Group,
  Text,
  TextInput,
  Tabs,
  Box,
  Select,
} from '@mantine/core';
import {
  FormAlert,
  LoadingState,
  FormActionButtons,
} from '../../components/global';
import { Dropzone } from '@mantine/dropzone';
import {
  IconUpload,
  IconX,
  IconFolderPlus,
  IconFileCode,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';

// Lazy load CodeMirror editor to reduce initial bundle size
const CodeMirrorEditor = lazy(() =>
  import('../../components/editor/CodeMirrorEditor.jsx').then((m) => ({
    default: m.CodeMirrorEditor,
  })),
);

const DEFAULT_EDITOR_CONTENT = '// Write your analysis code here';

/**
 * AnalysisCreatorModalContent
 *
 * Modal content for creating new analyses via file upload or inline code creation.
 * Supports team selection based on user permissions.
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Unique modal instance ID
 * @param {Object} props.context - Mantine modal context
 * @param {Object} props.innerProps - Custom props passed via modalService
 * @param {string} props.innerProps.targetTeam - Optional pre-selected team ID
 */
const AnalysisCreatorModalContent = ({ id, innerProps }) => {
  const { targetTeam = null } = innerProps;

  // SSE context
  const { loadingAnalyses, analyses } = useAnalyses();

  // Permissions and team data
  const { getUploadableTeams, isAdmin } = usePermissions();
  const uploadableTeams = getUploadableTeams();

  // Compute initial team selection before form initialization
  const initialTeamId = useMemo(() => {
    // If a target team is specified and user has access, use it
    if (targetTeam && uploadableTeams.some((team) => team.id === targetTeam)) {
      return targetTeam;
    }
    // Otherwise, pick the first available team
    return uploadableTeams.length > 0 ? uploadableTeams[0].id : null;
  }, [targetTeam, uploadableTeams]);

  // Initialize form with useStandardForm
  const { form, submitOperation, handleSubmit } = useStandardForm({
    initialValues: {
      mode: 'upload',
      selectedFile: null,
      analysisName: '',
      editableFileName: '',
      editorContent: DEFAULT_EDITOR_CONTENT,
      selectedTeamId: initialTeamId,
    },
    validate: {
      analysisName: (value, values) => {
        if (values.mode === 'create' && !value) {
          return 'Analysis name is required';
        }
        return null;
      },
      editableFileName: (value, values) => {
        if (values.mode === 'upload' && !value) {
          return 'Filename is required';
        }
        return null;
      },
      selectedFile: (value, values) => {
        if (values.mode === 'upload' && !value) {
          return 'Please select a file';
        }
        return null;
      },
      selectedTeamId: (value) => (!value ? 'Please select a team' : null),
    },
    resetOnSuccess: false,
  });

  // Use SSE analyses data directly
  const existingAnalyses = analyses ? Object.keys(analyses) : [];
  const currentAnalysisName =
    form.values.mode === 'upload'
      ? form.values.editableFileName
      : form.values.analysisName;
  const isCurrentAnalysisLoading =
    currentAnalysisName &&
    (loadingAnalyses.has(currentAnalysisName) || submitOperation.loading);

  // Build team select options
  const teamSelectData = uploadableTeams.map((team) => ({
    value: team.id,
    label: team.name,
  }));

  // Form validation and state checks
  const isInputDisabled = isCurrentAnalysisLoading;

  const handleEditorChange = (newContent) => {
    form.setFieldValue('editorContent', newContent);
  };

  // If user has no upload permissions anywhere, show warning
  if (!isAdmin && uploadableTeams.length === 0) {
    return (
      <Stack>
        <FormAlert
          type="warning"
          message={
            <>
              <Text fw={500}>No Upload Permissions</Text>
              <Text size="sm" mt="xs">
                You don&apos;t have upload permissions for any teams. Contact an
                administrator to grant you upload access.
              </Text>
            </>
          }
        />
        <FormActionButtons
          onCancel={() => modals.close(id)}
          cancelLabel="Close"
          showSubmit={false}
          fullWidth
        />
      </Stack>
    );
  }

  const hasFormContent =
    form.values.selectedFile ||
    form.values.editorContent !== DEFAULT_EDITOR_CONTENT ||
    form.values.analysisName ||
    form.values.editableFileName;
  const isSaveDisabled =
    isCurrentAnalysisLoading ||
    (form.values.mode === 'create' && !form.values.analysisName) ||
    (form.values.mode === 'upload' &&
      (!form.values.selectedFile || !form.values.editableFileName)) ||
    !form.values.selectedTeamId ||
    submitOperation.error;
  const isTabDisabled = hasFormContent && !isCurrentAnalysisLoading;

  // Validation
  const validateFilename = async (filename) => {
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

    if (!file.name.endsWith('.js') && !file.name.endsWith('.js')) {
      submitOperation.setError('Please select a JavaScript file (.js)');
      resetFileSelection();
      return;
    }

    const nameWithoutExtension = file.name.replace(/\.(js|cjs)$/, '');
    const validationError = await validateFilename(nameWithoutExtension);

    if (validationError) {
      submitOperation.setError(validationError);
      resetFileSelection();
      return;
    }

    submitOperation.setError(null);
    form.setFieldValue('selectedFile', file);
    form.setFieldValue('editableFileName', nameWithoutExtension);
    form.setFieldValue('analysisName', nameWithoutExtension);
  };

  const handleEditableFileNameChange = async (e) => {
    const value = e.target.value;
    form.setFieldValue('editableFileName', value);
    submitOperation.setError(await validateFilename(value));
  };

  const handleAnalysisNameChange = async (e) => {
    const value = e.target.value;
    form.setFieldValue('analysisName', value);
    submitOperation.setError(await validateFilename(value));
  };

  const handleModeChange = (newMode) => {
    if (isTabDisabled && form.values.mode !== newMode) return;
    form.setFieldValue('mode', newMode);
  };

  const handleTeamChange = (teamId) => {
    form.setFieldValue('selectedTeamId', teamId);
  };

  const handleUpload = handleSubmit(async (values) => {
    if (values.mode === 'create' && !values.analysisName) {
      throw new Error('Please provide a name for the analysis');
    }

    const finalFileName =
      values.mode === 'upload' ? values.editableFileName : values.analysisName;
    const validationError = await validateFilename(finalFileName);

    if (validationError) {
      throw new Error(validationError);
    }

    let file;
    if (values.mode === 'upload') {
      file = new File([values.selectedFile], finalFileName, {
        type: values.selectedFile.type,
      });
    } else {
      const blob = new Blob([values.editorContent], {
        type: 'text/javascript',
      });
      file = new File([blob], finalFileName, { type: 'text/javascript' });
    }

    await notificationAPI.uploadAnalysis(
      analysisService.uploadAnalysis(file, values.selectedTeamId),
      finalFileName,
    );

    modals.close(id);
  });

  const handleCancel = () => {
    modals.close(id);
  };

  // Utility functions
  const resetFileSelection = () => {
    form.setFieldValue('selectedFile', null);
    form.setFieldValue('editableFileName', '');
  };

  return (
    <Stack>
      {/* Mode Toggle */}
      <Tabs value={form.values.mode} onChange={handleModeChange}>
        <Tabs.List>
          <Tabs.Tab
            value="upload"
            disabled={isTabDisabled && form.values.mode !== 'upload'}
          >
            Upload Existing File
          </Tabs.Tab>
          <Tabs.Tab
            value="create"
            disabled={isTabDisabled && form.values.mode !== 'create'}
          >
            Create New Analysis
          </Tabs.Tab>
        </Tabs.List>

        {/* Team Selector - shown for all modes */}
        <Box pt="md">
          <Select
            label="Target Team"
            placeholder="Select a team"
            value={form.values.selectedTeamId}
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
                  submitOperation.setError(
                    'Please select a JavaScript file (.js)',
                  );
                }}
                maxFiles={1}
                disabled={isInputDisabled}
                styles={{
                  root: {
                    borderColor: form.values.selectedFile
                      ? 'var(--mantine-color-green-5)'
                      : undefined,
                    backgroundColor: form.values.selectedFile
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
                    {form.values.selectedFile ? (
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
                      {form.values.selectedFile
                        ? `Selected: ${form.values.selectedFile.name}`
                        : 'Drag JavaScript files here or click to select'}
                    </Text>
                    <Text size="sm" c="dimmed" inline mt={7}>
                      Attach .js files only
                    </Text>
                  </div>
                </Group>
              </Dropzone>
            </Box>

            {form.values.selectedFile && (
              <TextInput
                label="Edit Filename"
                value={form.values.editableFileName}
                onChange={handleEditableFileNameChange}
                placeholder="Enter filename (no extension)"
                disabled={isInputDisabled}
                error={
                  submitOperation.error &&
                  submitOperation.error.includes('already exists')
                }
              />
            )}

            <Text size="sm" c="dimmed">
              If not already included, the .js extension will be added by the
              backend as TagoIO requires ES modules.
            </Text>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="create" pt="md">
          <Stack>
            <TextInput
              label="Analysis Name"
              value={form.values.analysisName}
              onChange={handleAnalysisNameChange}
              placeholder="Enter analysis name (no extension)"
              disabled={isInputDisabled}
              error={
                submitOperation.error &&
                submitOperation.error.includes('already exists')
              }
            />

            <Text size="sm" c="dimmed">
              The .js extension will be added by the backend as TagoIO requires
              ES modules.
            </Text>

            <Text size="sm" c="dimmed">
              You will be able to edit the environment variables after creation.
            </Text>

            <Box
              h={500}
              style={{
                border: '1px solid var(--mantine-color-gray-3)',
                borderRadius: 'var(--mantine-radius-md)',
                overflow: 'hidden',
              }}
            >
              {form.values.mode === 'create' && (
                <Suspense
                  fallback={<LoadingState loading={true} minHeight={500} />}
                >
                  <CodeMirrorEditor
                    value={form.values.editorContent}
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
      <FormAlert type="error" message={submitOperation.error} />

      {/* Action Buttons */}
      <FormActionButtons
        onSubmit={handleUpload}
        onCancel={handleCancel}
        submitLabel="Save Analysis"
        cancelLabel="Cancel"
        loading={isCurrentAnalysisLoading}
        disabled={isSaveDisabled}
        cancelDisabled={isInputDisabled}
        submitType="button"
        mt={0}
        justify="flex-end"
      />
    </Stack>
  );
};

AnalysisCreatorModalContent.propTypes = {
  id: PropTypes.string.isRequired,
  context: PropTypes.object.isRequired,
  innerProps: PropTypes.shape({
    targetTeam: PropTypes.string,
  }).isRequired,
};

export default AnalysisCreatorModalContent;
