// frontend/src/components/analysis/analysisEdit.jsx
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Editor from '@monaco-editor/react';
import { analysisService } from '../../services/analysisService';
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
} from '@mantine/core';
import {
  IconEdit,
  IconCheck,
  IconX,
  IconAlertCircle,
} from '@tabler/icons-react';
import { useNotifications } from '../../hooks/useNotifications.jsx';

export default function EditAnalysisModal({
  onClose,
  analysis: currentAnalysis,
  readOnly = false,
}) {
  const [content, setContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newFileName, setNewFileName] = useState(currentAnalysis.name);
  const [displayName, setDisplayName] = useState(currentAnalysis.name);

  const notify = useNotifications();

  // Update analysis name when it changes via SSE (derived state)
  if (currentAnalysis.name !== newFileName && !isEditingName) {
    setNewFileName(currentAnalysis.name);
    setDisplayName(currentAnalysis.name);
  }

  // Load content when component mounts or analysis changes
  useEffect(() => {
    let isCancelled = false;

    async function loadContent() {
      if (!displayName) return;

      try {
        setIsLoading(true);
        setError(null);
        const fileContent =
          await analysisService.getAnalysisContent(displayName);

        if (!isCancelled) {
          setContent(fileContent);
          setHasChanges(false);
        }
      } catch (error) {
        console.error('Failed to load analysis content:', error);
        if (!isCancelled) {
          setError(error.message);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadContent();

    return () => {
      isCancelled = true;
    };
  }, [displayName]);

  const handleEditorChange = (value) => {
    setContent(value);
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setError(null);

      await notify.updateAnalysis(
        analysisService.updateAnalysis(displayName, content),
        displayName,
      );

      setHasChanges(false);
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
      setError(error.message || 'Failed to update analysis content.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = async () => {
    try {
      if (!newFileName.trim()) {
        setError('Filename cannot be empty');
        return;
      }

      if (newFileName === displayName) {
        setIsEditingName(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      await notify.executeWithNotification(
        analysisService.renameAnalysis(displayName, newFileName),
        {
          loading: `Renaming ${displayName} to ${newFileName}...`,
          success: `Analysis renamed to ${newFileName} successfully.`,
        },
      );

      // Update the displayed name immediately and exit edit mode
      setDisplayName(newFileName);
      setIsEditingName(false);
    } catch (error) {
      console.error('Rename failed:', error);
      setError(error.message || 'Failed to rename analysis.');
      // Reset the filename input to the current name if rename fails
      setNewFileName(displayName);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      size="90%"
      title={
        <Group gap="xs">
          <Text fw={600}>
            {readOnly ? 'Viewing' : 'Editing'} Analysis Content:
          </Text>
          {!readOnly && isEditingName ? (
            <Group gap="xs">
              <TextInput
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                size="xs"
                autoFocus
                style={{ width: 200 }}
              />
              <ActionIcon
                color="green"
                size="sm"
                onClick={handleRename}
                disabled={isLoading}
              >
                <IconCheck size={16} />
              </ActionIcon>
              <ActionIcon
                color="red"
                size="sm"
                onClick={() => {
                  setIsEditingName(false);
                  setNewFileName(displayName);
                }}
                disabled={isLoading}
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          ) : (
            <Group gap={4}>
              <Text>{displayName}</Text>
              {!readOnly && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => setIsEditingName(true)}
                  disabled={isLoading}
                >
                  <IconEdit size={14} />
                </ActionIcon>
              )}
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
          >
            {error}
          </Alert>
        )}

        <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <LoadingOverlay visible={isLoading} />
          {!isLoading && (
            <Editor
              height="100%"
              defaultLanguage="javascript"
              value={content}
              onChange={handleEditorChange}
              theme="vs-dark"
              options={{
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                fontSize: 14,
                automaticLayout: true,
                wordWrap: 'on',
                lineNumbers: 'on',
                folding: true,
                foldingStrategy: 'indentation',
                readOnly: readOnly,
              }}
            />
          )}
        </Box>

        <Group
          justify="flex-end"
          pt="md"
          style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
        >
          <Button variant="default" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button
              onClick={handleSave}
              disabled={!hasChanges}
              loading={isLoading}
              color="brand"
            >
              Save Changes
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

EditAnalysisModal.propTypes = {
  analysis: PropTypes.shape({
    name: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['listener']),
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
};
