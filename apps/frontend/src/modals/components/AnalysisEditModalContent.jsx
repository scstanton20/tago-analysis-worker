/**
 * Modal content for editing analysis scripts and environment variables
 * Features:
 * - Code editing with syntax highlighting and linting
 * - Version comparison in diff mode
 * - Auto-formatting with Prettier
 * - Analysis renaming
 * - Environment variable editing
 * @module modals/components/AnalysisEditModalContent
 */
import { lazy, Suspense } from 'react';
import {
  Stack,
  Group,
  Text,
  TextInput,
  Box,
  ActionIcon,
  Switch,
  Badge,
  Tooltip,
  CloseButton,
} from '@mantine/core';
import {
  FormAlert,
  FormActionButtons,
  LoadingState,
  SecondaryButton,
  CancelButton,
} from '../../components/global';
import {
  IconEdit,
  IconCheck,
  IconX,
  IconGitCompare,
  IconWand,
  IconChevronUp,
  IconChevronDown,
  IconCircleXFilled,
  IconAlertTriangleFilled,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import { useAnalysisEdit } from '../../hooks/useAnalysisEdit';
import { useDiagnostics } from '../../hooks/useDiagnostics';
const CodeMirrorEditor = lazy(() =>
  import('../../components/editor/CodeMirrorEditor.jsx').then((m) => ({
    default: m.CodeMirrorEditor,
  })),
);
import { useAnalyses } from '../../contexts/sseContext';
import PropTypes from 'prop-types';

/**
 * Analysis Edit Modal Content Component
 * Provides a full-featured editor for analysis scripts and environment variables
 *
 * This component is rendered inside Mantine's context modal system.
 * @param {Object} props - Component props from Mantine context modal
 * @param {string} props.id - Unique modal instance ID
 * @param {Object} props.innerProps - Custom props passed via modalService
 */
function AnalysisEditModalContent({ id, innerProps }) {
  const {
    analysis: initialAnalysis,
    readOnly,
    type,
    version,
    showDiffToggle,
  } = innerProps;
  const notify = useNotifications();

  // Analysis edit state and operations (using initial analysis)
  const {
    content,
    hasChanges,
    isLoading,
    isEditingName,
    newFileName,
    displayName,
    diffMode,
    currentContent,
    formatCodeFn,
    hasFormatChanges,
    isEnvMode,
    setIsEditingName,
    setNewFileName,
    handleEditorChange,
    handleFormatReady,
    handleFormat,
    handleDiffToggle,
    handleSave,
    handleRename,
  } = useAnalysisEdit({
    analysis: initialAnalysis,
    type,
    version,
    notify,
    readOnly,
  });

  // Get analyses from SSE context
  const { getAnalysis } = useAnalyses();

  // Get live analysis using displayName (which updates after renames)
  const liveAnalysis = getAnalysis(displayName);

  // Use live analysis for display if available
  const currentAnalysis = liveAnalysis || initialAnalysis;

  // Diagnostic navigation for linting
  const {
    errorCount,
    warningCount,
    handleDiagnosticsChange,
    handleViewReady,
    navigateToNextDiagnostic,
    navigateToPrevDiagnostic,
  } = useDiagnostics();

  // Handle save and close
  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) {
      modals.close(id);
    }
  };

  const modalTitle = isEnvMode ? 'Environment' : 'Analysis Content';
  // Use displayName which is kept in sync with SSE via the hook
  const nameToDisplay = isEnvMode ? currentAnalysis.name : displayName;
  const versionText = version !== null && version !== 0 ? ` (v${version})` : '';

  return (
    <Stack h="calc(100vh - 200px)">
      {/* Custom modal header - replacing default Mantine header */}
      <Box
        mb="sm"
        pb="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
            <Text fw={600} id="code-editor-modal-title">
              {readOnly ? 'Viewing' : 'Editing'} {modalTitle}:
            </Text>
            {!isEnvMode && !readOnly && isEditingName ? (
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  size="xs"
                  style={{ width: 200 }}
                  placeholder="Analysis name"
                />
                <ActionIcon
                  color="green"
                  size="sm"
                  onClick={handleRename}
                  disabled={isLoading}
                  aria-label="Confirm rename"
                >
                  <IconCheck size={16} aria-hidden="true" />
                </ActionIcon>
                <ActionIcon
                  color="red"
                  size="sm"
                  onClick={() => {
                    setIsEditingName(false);
                    setNewFileName(displayName);
                  }}
                  disabled={isLoading}
                  aria-label="Cancel rename"
                >
                  <IconX size={16} aria-hidden="true" />
                </ActionIcon>
              </Group>
            ) : (
              <Group gap={4} wrap="nowrap">
                <Text>
                  {nameToDisplay}
                  {versionText}
                </Text>
                {!isEnvMode && !readOnly && !version && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => setIsEditingName(true)}
                    disabled={isLoading}
                    aria-label="Rename analysis"
                  >
                    <IconEdit size={14} aria-hidden="true" />
                  </ActionIcon>
                )}
              </Group>
            )}
            {isEnvMode && currentAnalysis.status && (
              <Text size="sm" c="dimmed">
                ({currentAnalysis.status})
              </Text>
            )}
          </Group>
          <CloseButton onClick={() => modals.close(id)} size="lg" />
        </Group>
        {showDiffToggle && (
          <Group gap="xs" wrap="nowrap">
            <Switch
              size="sm"
              checked={diffMode}
              onChange={(event) =>
                handleDiffToggle(event.currentTarget.checked)
              }
              label="Show diff from current"
              disabled={isLoading}
            />
            <IconGitCompare size={16} color="var(--mantine-color-purple-6)" />
          </Group>
        )}
      </Box>

      {isEnvMode && (
        <FormAlert
          color="blue"
          variant="light"
          title="Environment Variables Format"
        >
          <Text size="sm">
            Use{' '}
            <Text span ff="monospace">
              KEY=value
            </Text>{' '}
            format. Keys will be automatically normalized to uppercase. Comments
            starting with{' '}
            <Text span ff="monospace">
              #
            </Text>{' '}
            are preserved.
          </Text>
        </FormAlert>
      )}

      <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Suspense fallback={<LoadingState loading={true} minHeight={400} />}>
          <CodeMirrorEditor
            value={content}
            onChange={handleEditorChange}
            readOnly={readOnly}
            language={isEnvMode ? 'plaintext' : 'javascript'}
            height="100%"
            diffMode={diffMode}
            originalContent={currentContent}
            onFormatReady={handleFormatReady}
            onDiagnosticsChange={handleDiagnosticsChange}
            onViewReady={handleViewReady}
          />
        </Suspense>
      </Box>

      <Group
        justify="space-between"
        pt="md"
        style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
      >
        <Group>
          {!readOnly && !isEnvMode && formatCodeFn && (
            <SecondaryButton
              leftSection={<IconWand size={16} />}
              onClick={handleFormat}
              disabled={isLoading || !hasFormatChanges}
            >
              Format (Ctrl/CMD+Shift+F)
            </SecondaryButton>
          )}
          {!readOnly && !isEnvMode && (errorCount > 0 || warningCount > 0) && (
            <Group gap="xs">
              <Group gap={4}>
                {errorCount > 0 && (
                  <Tooltip
                    label={`${errorCount} error${errorCount > 1 ? 's' : ''}`}
                  >
                    <Badge
                      color="red"
                      variant="filled"
                      leftSection={<IconCircleXFilled size={12} />}
                    >
                      {errorCount}
                    </Badge>
                  </Tooltip>
                )}
                {warningCount > 0 && (
                  <Tooltip
                    label={`${warningCount} warning${warningCount > 1 ? 's' : ''}`}
                  >
                    <Badge
                      color="yellow"
                      variant="filled"
                      leftSection={<IconAlertTriangleFilled size={12} />}
                    >
                      {warningCount}
                    </Badge>
                  </Tooltip>
                )}
              </Group>
              <Group gap={4}>
                <Tooltip label="Previous issue">
                  <ActionIcon
                    variant="subtle"
                    onClick={navigateToPrevDiagnostic}
                    disabled={errorCount + warningCount === 0}
                    size="sm"
                  >
                    <IconChevronUp size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Next issue">
                  <ActionIcon
                    variant="subtle"
                    onClick={navigateToNextDiagnostic}
                    disabled={errorCount + warningCount === 0}
                    size="sm"
                  >
                    <IconChevronDown size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          )}
        </Group>
        {!readOnly ? (
          <FormActionButtons
            onSubmit={handleSaveAndClose}
            onCancel={() => modals.close(id)}
            loading={isLoading}
            disabled={!hasChanges}
            submitLabel="Save Changes"
          />
        ) : (
          <CancelButton onClick={() => modals.close(id)}>Close</CancelButton>
        )}
      </Group>
    </Stack>
  );
}

AnalysisEditModalContent.propTypes = {
  id: PropTypes.string.isRequired,
  innerProps: PropTypes.shape({
    analysis: PropTypes.object.isRequired,
    readOnly: PropTypes.bool,
    type: PropTypes.string,
    version: PropTypes.number,
    showDiffToggle: PropTypes.bool,
  }).isRequired,
};

export default AnalysisEditModalContent;
