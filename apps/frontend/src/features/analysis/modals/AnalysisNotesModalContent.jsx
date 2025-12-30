/**
 * Modal content for viewing/editing analysis notes in Markdown format
 * Uses react-markdown for rendering and CodeMirror for editing
 * Starts in view mode by default, user can switch to edit mode
 * @module modals/components/AnalysisNotesModalContent
 */
import { useState, useCallback, lazy, Suspense } from 'react';
import {
  Stack,
  Group,
  Text,
  Box,
  CloseButton,
  Badge,
  ScrollArea,
} from '@mantine/core';
import { IconNotes, IconEdit, IconEye } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import Markdown from 'react-markdown';
import PropTypes from 'prop-types';
import {
  FormAlert,
  FormActionButtons,
  LoadingState,
  SecondaryButton,
  CancelButton,
  UnsavedChangesOverlay,
} from '@/components/global';
import { useUnsavedChangesGuard } from '@/hooks/modals';
import { useAsyncMountOnce } from '@/hooks/async/useAsyncMount';
import { useAsyncOperation } from '@/hooks/async/useAsyncOperation';
import { usePermissions } from '@/features/auth/hooks/usePermissions';
import { analysisService } from '../api/analysisService';

// Lazy load CodeMirror editor to reduce initial bundle size
const CodeMirrorEditor = lazy(() =>
  import('@/components/editor/CodeMirrorEditor.jsx').then((m) => ({
    default: m.CodeMirrorEditor,
  })),
);

/**
 * Analysis Notes Modal Content Component
 * Provides a markdown viewer/editor for analysis documentation notes
 */
function AnalysisNotesModalContent({ id, innerProps }) {
  const { analysis, onNotesUpdated } = innerProps;
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const { isAdmin } = usePermissions();
  // Load notes on mount
  const {
    loading,
    error,
    data: notesData,
  } = useAsyncMountOnce(async () => {
    const data = await analysisService.getAnalysisNotes(analysis.id);
    setContent(data.content || '');
    setOriginalContent(data.content || '');
    return data;
  });

  const saveOp = useAsyncOperation();

  // Check if content has changed
  const hasChanges = content !== originalContent;

  // Guard against closing/switching with unsaved changes
  const { showConfirmation, requestAction, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard(isEditing && hasChanges);

  // Handle close with unsaved changes check
  const handleClose = () => {
    if (requestAction(() => modals.close(id))) {
      modals.close(id);
    }
  };

  // Handle editor content change
  const handleEditorChange = useCallback((value) => {
    setContent(value);
  }, []);

  // Toggle edit mode with unsaved changes check
  const handleToggleEdit = () => {
    if (isEditing && hasChanges) {
      // Request action - will show confirmation overlay
      requestAction(() => {
        setContent(originalContent);
        setIsEditing(false);
      });
    } else {
      setIsEditing(!isEditing);
    }
  };

  // Handle save
  const handleSave = async () => {
    await saveOp.execute(async () => {
      await analysisService.updateAnalysisNotes(analysis.id, content);
      setOriginalContent(content);
      if (onNotesUpdated) {
        onNotesUpdated();
      }
      modals.close(id);
    });
  };

  if (loading) {
    return <LoadingState loading={true} minHeight={400} />;
  }

  if (error) {
    return (
      <Stack>
        <FormAlert
          type="error"
          message={error?.message || 'Failed to load notes'}
        />
        <Group justify="flex-end">
          <CancelButton onClick={() => modals.close(id)}>Close</CancelButton>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack h="calc(100vh - 200px)" style={{ position: 'relative' }}>
      {/* Unsaved changes confirmation overlay */}
      {showConfirmation && (
        <UnsavedChangesOverlay
          onConfirm={confirmDiscard}
          onCancel={cancelDiscard}
          message="You have unsaved changes to these notes. Are you sure you want to discard them?"
        />
      )}

      {/* Custom modal header */}
      <Box
        mb="sm"
        pb="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconNotes size={20} color="var(--mantine-color-brand-6)" />
            <Text fw={600}>Analysis Notes: {analysis.name}</Text>
            {notesData?.isNew && (
              <Badge color="blue" variant="light" size="sm">
                New
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {isAdmin && (
              <SecondaryButton
                size="xs"
                leftSection={
                  isEditing ? <IconEye size={14} /> : <IconEdit size={14} />
                }
                onClick={handleToggleEdit}
              >
                {isEditing ? 'View' : 'Edit'}
              </SecondaryButton>
            )}
            <CloseButton onClick={handleClose} size="lg" />
          </Group>
        </Group>
      </Box>

      {/* Info alert for markdown format - only show in edit mode */}
      {isEditing && (
        <FormAlert type="info" title="Markdown Supported">
          <Text size="sm">
            Write your notes using Markdown syntax. Use headings (##), lists
            (-), code blocks (```), and other Markdown formatting.
          </Text>
        </FormAlert>
      )}

      {/* Error alert if save failed */}
      {saveOp.error && (
        <FormAlert
          type="error"
          message={saveOp.error?.message || 'Failed to save notes'}
        />
      )}

      {/* Content area - rendered markdown in view mode, CodeMirror in edit mode */}
      <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {isEditing ? (
          <Suspense
            fallback={
              <LoadingState loading={true} skeleton pattern="content" />
            }
          >
            <CodeMirrorEditor
              value={content}
              onChange={handleEditorChange}
              language="markdown"
              height="100%"
              readOnly={false}
            />
          </Suspense>
        ) : (
          <ScrollArea h="100%" offsetScrollbars>
            <Markdown>
              {content || '*No notes yet. Click Edit to add notes.*'}
            </Markdown>
          </ScrollArea>
        )}
      </Box>

      {/* Footer with stats and actions */}
      <Group
        justify="space-between"
        pt="md"
        style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
      >
        <Group gap="md">
          <Text size="xs" c="dimmed">
            {content.split('\n').length} lines
          </Text>
          <Text size="xs" c="dimmed">
            {content.length.toLocaleString()} characters
          </Text>
          {notesData?.lastModified && (
            <Text size="xs" c="dimmed">
              Last saved:{' '}
              {new Date(notesData.lastModified).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </Group>
        {isEditing ? (
          <FormActionButtons
            onSubmit={handleSave}
            onCancel={handleToggleEdit}
            loading={saveOp.loading}
            disabled={!hasChanges}
            submitLabel="Save Notes"
            cancelLabel="Cancel Edit"
          />
        ) : (
          <CancelButton onClick={handleClose}>Close</CancelButton>
        )}
      </Group>
    </Stack>
  );
}

AnalysisNotesModalContent.propTypes = {
  id: PropTypes.string.isRequired,
  innerProps: PropTypes.shape({
    analysis: PropTypes.object.isRequired,
    onNotesUpdated: PropTypes.func,
  }).isRequired,
};

export default AnalysisNotesModalContent;
