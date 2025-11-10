/**
 * Modal for editing analysis scripts and environment variables
 * Features:
 * - Code editing with syntax highlighting and linting
 * - Version comparison in diff mode
 * - Auto-formatting with Prettier
 * - Analysis renaming
 * - Environment variable editing
 * @module components/modals/AnalysisEditModal
 */

import PropTypes from 'prop-types';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  TextInput,
  Alert,
  Box,
  ActionIcon,
  LoadingOverlay,
  Switch,
  Badge,
  Tooltip,
} from '@mantine/core';
import {
  IconEdit,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconGitCompare,
  IconWand,
  IconChevronUp,
  IconChevronDown,
  IconCircleXFilled,
  IconAlertTriangleFilled,
} from '@tabler/icons-react';
import { useNotifications } from '../../hooks/useNotifications.jsx';
import { useAnalysisEdit } from '../../hooks/useAnalysisEdit';
import { useDiagnostics } from '../../hooks/useDiagnostics';
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor.jsx';

/**
 * Analysis Edit Modal Component
 * Provides a full-featured editor for analysis scripts and environment variables
 */
export default function AnalysisEditModal({
  onClose,
  analysis: currentAnalysis,
  readOnly = false,
  type = 'analysis', // 'analysis' or 'env'
  version = null, // version number for viewing specific versions
  showDiffToggle = false, // whether to show diff toggle
}) {
  const notify = useNotifications();

  // Analysis edit state and operations
  const {
    content,
    hasChanges,
    isLoading,
    error,
    isEditingName,
    newFileName,
    displayName,
    diffMode,
    currentContent,
    formatCodeFn,
    hasFormatChanges,
    isEnvMode,
    setError,
    setIsEditingName,
    setNewFileName,
    handleEditorChange,
    handleFormatReady,
    handleFormat,
    handleDiffToggle,
    handleSave,
    handleRename,
  } = useAnalysisEdit({
    analysis: currentAnalysis,
    type,
    version,
    notify,
    readOnly,
  });

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
      onClose();
    }
  };

  const modalTitle = isEnvMode ? 'Environment' : 'Analysis Content';
  const nameToDisplay = isEnvMode ? currentAnalysis.name : displayName;
  const versionText = version !== null && version !== 0 ? ` (v${version})` : '';

  return (
    <Modal
      opened
      onClose={onClose}
      size="90%"
      aria-labelledby="code-editor-modal-title"
      title={
        <Group gap="xs">
          <Text fw={600} id="code-editor-modal-title">
            {readOnly ? 'Viewing' : 'Editing'} {modalTitle}:
          </Text>
          {!isEnvMode && !readOnly && isEditingName ? (
            <Group gap="xs">
              <TextInput
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                size="xs"
                style={{ width: 200 }}
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
            <Group gap={4}>
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
          {showDiffToggle && (
            <Group gap="xs">
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
        </Group>
      }
      styles={{
        body: {
          height: 'calc(100vh - 200px)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Stack h="100%">
        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
            onClose={() => setError(null)}
            withCloseButton
          >
            {error}
          </Alert>
        )}

        {isEnvMode && (
          <Alert
            color="blue"
            variant="light"
            title="Environment Variables Format"
          >
            <Text size="sm">
              Use{' '}
              <Text span ff="monospace">
                KEY=value
              </Text>{' '}
              format. Keys will be automatically normalized to uppercase.
              Comments starting with{' '}
              <Text span ff="monospace">
                #
              </Text>{' '}
              are preserved.
            </Text>
          </Alert>
        )}

        <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <LoadingOverlay visible={isLoading} />
          {!isLoading && (
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
          )}
        </Box>

        <Group
          justify="space-between"
          pt="md"
          style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
        >
          <Group>
            {!readOnly && !isEnvMode && formatCodeFn && (
              <Button
                leftSection={<IconWand size={16} />}
                variant="light"
                onClick={handleFormat}
                disabled={isLoading || !hasFormatChanges}
              >
                Format (Ctrl/CMD+Shift+F)
              </Button>
            )}
            {!readOnly &&
              !isEnvMode &&
              (errorCount > 0 || warningCount > 0) && (
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
          <Group>
            <Button variant="default" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button
                onClick={handleSaveAndClose}
                disabled={!hasChanges}
                loading={isLoading}
                color="brand"
              >
                Save Changes
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

AnalysisEditModal.propTypes = {
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
    status: PropTypes.string,
    enabled: PropTypes.bool,
    logs: PropTypes.arrayOf(
      PropTypes.shape({
        timestamp: PropTypes.string,
        message: PropTypes.string,
      }),
    ),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  readOnly: PropTypes.bool,
  type: PropTypes.oneOf(['analysis', 'env']),
  version: PropTypes.number,
  showDiffToggle: PropTypes.bool,
};
