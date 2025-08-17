import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { basicSetup, minimalSetup } from 'codemirror';
import { EditorView, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { unifiedMergeView } from '@codemirror/merge';
import { useMantineColorScheme } from '@mantine/core';

// Custom read-only setup with line numbers and syntax highlighting
const readOnlySetup = [
  lineNumbers(),
  EditorView.lineWrapping,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

// Dark theme for CodeMirror
const darkTheme = EditorView.theme(
  {
    '&': {
      color: '#e6edf3',
      backgroundColor: '#0d1117',
      height: '100%',
      fontSize: '14px',
      border: '1px solid #30363d',
    },
    '.cm-editor': {
      height: '100%',
      backgroundColor: '#0d1117',
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      backgroundColor: '#0d1117',
    },
    '.cm-content': {
      padding: '10px',
      caretColor: '#e6edf3',
      minHeight: '100%',
      backgroundColor: '#0d1117',
    },
    '.cm-focused .cm-cursor': {
      borderLeftColor: '#e6edf3',
    },
    '.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: '#264f78',
      },
    '.cm-gutters': {
      backgroundColor: '#161b22',
      color: '#8b949e',
      border: 'none',
      borderRight: '1px solid #30363d',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#1f2937',
      color: '#58a6ff',
    },
    '.cm-activeLine': {
      backgroundColor: '#21262d',
    },
    '.cm-comment': {
      color: '#8b949e',
      fontStyle: 'italic',
    },
    '.cm-scroller, .cm-content, .cm-editor, .cm-focused': {
      willChange: 'auto !important',
    },
    '.cm-line': {
      willChange: 'auto !important',
    },
    '.cm-readonly-container .cm-scroller, .cm-readonly-container .cm-content, .cm-readonly-container .cm-editor, .cm-readonly-container .cm-line':
      {
        willChange: 'auto !important',
        transform: 'none !important',
      },
    // Diff view specific overrides
    '.cm-merge-view, .cm-merge-view *': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
    '.cm-merge-gutter, .cm-merge-chunk, .cm-merge-spacer': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
    '.cm-deletedChunk, .cm-insertedChunk, .cm-unchangedChunk': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
    // Global override for all CodeMirror elements in diff mode
    '*[class*="cm-"], *[class*="merge-"], *[class*="diff-"]': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
    // Additional specific classes that might be created
    '.cm-unified-merge, .cm-merge-editor': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
  },
  { dark: true },
);

// Light theme for CodeMirror
const lightTheme = EditorView.theme(
  {
    '&': {
      color: '#24292e',
      backgroundColor: '#ffffff',
      height: '100%',
      fontSize: '14px',
      border: '1px solid #d0d7de',
    },
    '.cm-editor': {
      height: '100%',
      backgroundColor: '#ffffff',
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      backgroundColor: '#ffffff',
    },
    '.cm-content': {
      padding: '10px',
      caretColor: '#24292e',
      minHeight: '100%',
      backgroundColor: '#ffffff',
    },
    '.cm-focused .cm-cursor': {
      borderLeftColor: '#24292e',
    },
    '.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: '#c8e1ff',
      },
    '.cm-gutters': {
      backgroundColor: '#f6f8fa',
      color: '#6e7781',
      border: 'none',
      borderRight: '1px solid #d0d7de',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#e6f3ff',
      color: '#0969da',
    },
    '.cm-activeLine': {
      backgroundColor: '#f6f8fa',
    },
    '.cm-comment': {
      color: '#6a737d',
      fontStyle: 'italic',
    },
    '.cm-scroller, .cm-content, .cm-editor, .cm-focused': {
      willChange: 'auto !important',
    },
    '.cm-line': {
      willChange: 'auto !important',
    },
    '.cm-readonly-container .cm-scroller, .cm-readonly-container .cm-content, .cm-readonly-container .cm-editor, .cm-readonly-container .cm-line':
      {
        willChange: 'auto !important',
        transform: 'none !important',
      },
    // Diff view specific overrides
    '.cm-merge-view, .cm-merge-view *': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
    '.cm-merge-gutter, .cm-merge-chunk, .cm-merge-spacer': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
    '.cm-deletedChunk, .cm-insertedChunk, .cm-unchangedChunk': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
    // Global override for all CodeMirror elements in diff mode
    '*[class*="cm-"], *[class*="merge-"], *[class*="diff-"]': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
    // Additional specific classes that might be created
    '.cm-unified-merge, .cm-merge-editor': {
      willChange: 'auto !important',
      transform: 'none !important',
    },
  },
  { dark: false },
);
import { analysisService } from '../../services/analysisService.js';
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
} from '@mantine/core';
import {
  IconEdit,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconGitCompare,
} from '@tabler/icons-react';
import { useNotifications } from '../../hooks/useNotifications.jsx';

// Reusable CodeMirror editor component
function CodeMirrorEditor({
  value = '',
  onChange,
  readOnly = false,
  language = 'javascript',
  height = '100%',
  diffMode = false,
  originalContent = '',
}) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const languageRef = useRef(language);
  const { colorScheme } = useMantineColorScheme();

  // Keep refs current
  useEffect(() => {
    onChangeRef.current = onChange;
    readOnlyRef.current = readOnly;
    languageRef.current = language;
  });

  // Inject global CSS to override will-change for all CodeMirror elements
  useEffect(() => {
    const styleId = 'codemirror-will-change-override';
    const existingStyle = document.getElementById(styleId);

    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* Global will-change override for CodeMirror elements */
        .cm-editor *, 
        .cm-content *, 
        .cm-scroller *, 
        .cm-line *,
        [class*="cm-"] *,
        [class*="merge-"] *,
        [class*="diff-"] * {
          will-change: auto !important;
          transform: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      // Clean up the style when component unmounts
      const style = document.getElementById(styleId);
      if (style) {
        style.remove();
      }
    };
  }, []);

  // Create editor once on mount
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    // Determine theme based on current color scheme
    const isDark =
      colorScheme === 'dark' ||
      (colorScheme === 'auto' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    const currentTheme = isDark ? darkTheme : lightTheme;

    if (diffMode && originalContent) {
      // Create unified diff view (inline diff)
      const extensions = [
        readOnlyRef.current ? minimalSetup : basicSetup,
        currentTheme,
        unifiedMergeView({
          original: value || '', // Current version as original
          mergeControls: false, // Disable accept/reject controls for read-only viewing
        }),
        EditorView.editable.of(false), // Diff view is always read-only
      ];

      // Add language support
      if (languageRef.current === 'javascript') {
        extensions.push(javascript());
      }

      const state = EditorState.create({
        doc: originalContent || '', // Previous version content as the document
        extensions,
      });

      const view = new EditorView({
        state,
        parent: editorRef.current,
      });

      viewRef.current = view;
    } else {
      // Create regular editor
      const extensions = [
        readOnlyRef.current ? readOnlySetup : basicSetup,
        currentTheme,
      ];

      // Add update listener for editable editors
      if (!readOnlyRef.current) {
        extensions.push(
          EditorView.updateListener.of((update) => {
            if (update.docChanged && onChangeRef.current) {
              const newContent = update.state.doc.toString();
              onChangeRef.current(newContent);
            }
          }),
        );
      }

      // Add language support
      if (languageRef.current === 'javascript') {
        extensions.push(javascript());
      }

      const state = EditorState.create({
        doc: value || '',
        extensions,
      });

      const view = new EditorView({
        state,
        parent: editorRef.current,
      });

      viewRef.current = view;
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
    // ESLint wants dependencies, but including them would cause recreation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Create only once

  // Update theme when colorScheme changes
  useEffect(() => {
    if (viewRef.current) {
      const isDark =
        colorScheme === 'dark' ||
        (colorScheme === 'auto' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      const currentTheme = isDark ? darkTheme : lightTheme;

      // For theme changes, we need to recreate the editor with the new theme
      // This is the correct way to handle theme switching in CodeMirror 6
      const currentContent = viewRef.current.state.doc.toString();
      const parent = viewRef.current.dom.parentNode;

      // Track if this is currently a diff view based on props
      const isDiffView = diffMode && originalContent;

      viewRef.current.destroy();

      if (isDiffView) {
        // Recreate unified diff view
        const extensions = [
          readOnlyRef.current ? minimalSetup : basicSetup,
          currentTheme,
          unifiedMergeView({
            original: currentContent || '', // Current version as original
            mergeControls: false, // Disable accept/reject controls
          }),
          EditorView.editable.of(false),
        ];

        if (languageRef.current === 'javascript') {
          extensions.push(javascript());
        }

        const state = EditorState.create({
          doc: originalContent || '', // Previous version as document
          extensions,
        });

        const view = new EditorView({
          state,
          parent,
        });

        viewRef.current = view;
      } else {
        // Recreate regular editor
        const extensions = [
          readOnlyRef.current ? readOnlySetup : basicSetup,
          currentTheme,
        ];

        // Add update listener for editable editors
        if (!readOnlyRef.current) {
          extensions.push(
            EditorView.updateListener.of((update) => {
              if (update.docChanged && onChangeRef.current) {
                const newContent = update.state.doc.toString();
                onChangeRef.current(newContent);
              }
            }),
          );
        }

        if (languageRef.current === 'javascript') {
          extensions.push(javascript());
        }

        const state = EditorState.create({
          doc: currentContent,
          extensions,
        });

        const view = new EditorView({
          state,
          parent,
        });

        viewRef.current = view;
      }
    }
  }, [colorScheme, diffMode, originalContent]);

  // Update content when value changes externally (but not from user typing)
  useEffect(() => {
    if (viewRef.current && viewRef.current.state) {
      // For unified diff view, content updates should recreate the view
      // since we need to update the comparison
      if (diffMode && originalContent) {
        if (viewRef.current.state.doc.toString() !== value) {
          // Recreate the unified diff view with new content
          const parent = viewRef.current.dom.parentNode;
          const isDark =
            colorScheme === 'dark' ||
            (colorScheme === 'auto' &&
              window.matchMedia('(prefers-color-scheme: dark)').matches);
          const currentTheme = isDark ? darkTheme : lightTheme;

          viewRef.current.destroy();

          const extensions = [
            readOnlyRef.current ? minimalSetup : basicSetup,
            currentTheme,
            unifiedMergeView({
              original: value || '', // Current version as original
              mergeControls: false, // Disable accept/reject controls
            }),
            EditorView.editable.of(false),
          ];

          if (languageRef.current === 'javascript') {
            extensions.push(javascript());
          }

          const state = EditorState.create({
            doc: originalContent || '', // Previous version as document
            extensions,
          });

          const view = new EditorView({
            state,
            parent,
          });

          viewRef.current = view;
        }
      } else {
        // Regular editor - just update content
        if (viewRef.current.state.doc.toString() !== value) {
          viewRef.current.dispatch({
            changes: {
              from: 0,
              to: viewRef.current.state.doc.length,
              insert: value || '',
            },
          });
        }
      }
    }
  }, [value, diffMode, originalContent, colorScheme]);

  return (
    <div
      ref={editorRef}
      className={readOnly ? 'cm-readonly-container' : 'cm-editable-container'}
      style={{
        height,
        width: '100%',
        overflow: 'hidden',
        fontSize: '14px',
        display: 'flex',
        flexDirection: 'column',
        // Global will-change override for all children
        willChange: 'auto',
      }}
    />
  );
}

CodeMirrorEditor.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  readOnly: PropTypes.bool,
  language: PropTypes.oneOf(['javascript', 'plaintext']),
  height: PropTypes.string,
  diffMode: PropTypes.bool,
  originalContent: PropTypes.string,
};

export { CodeMirrorEditor };

export default function AnalysisEditModal({
  onClose,
  analysis: currentAnalysis,
  readOnly = false,
  type = 'analysis', // 'analysis' or 'env'
  version = null, // version number for viewing specific versions
  showDiffToggle = false, // whether to show diff toggle
}) {
  const [content, setContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newFileName, setNewFileName] = useState(currentAnalysis.name);
  const [displayName, setDisplayName] = useState(currentAnalysis.name);
  const [diffMode, setDiffMode] = useState(false);
  const [currentContent, setCurrentContent] = useState('');

  const notify = useNotifications();
  const isEnvMode = type === 'env';

  // Update analysis name when it changes via SSE (only for analysis mode)
  if (!isEnvMode && currentAnalysis.name !== newFileName && !isEditingName) {
    setNewFileName(currentAnalysis.name);
    setDisplayName(currentAnalysis.name);
  }

  const handleEditorChange = useCallback((newContent) => {
    // Just update the content state directly, don't format in real-time
    setContent(newContent);
    setHasChanges(true);
  }, []);

  const handleDiffToggle = useCallback(
    async (enabled) => {
      if (enabled && !currentContent) {
        try {
          setIsLoading(true);
          // Fetch current version content for comparison
          const current = await analysisService.getAnalysisContent(
            currentAnalysis.name,
            0,
          );
          setCurrentContent(current);
          setDiffMode(true);
        } catch (error) {
          console.error('Failed to fetch current content for diff:', error);
          setError('Failed to load current version for comparison');
          return;
        } finally {
          setIsLoading(false);
        }
      } else {
        setDiffMode(enabled);
        if (!enabled) {
          setCurrentContent(''); // Clean up when diff is disabled
        }
      }
    },
    [currentAnalysis.name, currentContent],
  );

  // Load content when component mounts or analysis changes
  useEffect(() => {
    let isCancelled = false;

    async function loadContent() {
      const nameToUse = isEnvMode ? currentAnalysis.name : displayName;
      if (!nameToUse) return;

      try {
        setIsLoading(true);
        setError(null);

        const fileContent = isEnvMode
          ? await analysisService.getAnalysisENVContent(nameToUse)
          : await analysisService.getAnalysisContent(nameToUse, version);

        if (!isCancelled) {
          setContent(fileContent);
          setHasChanges(false);
        }
      } catch (error) {
        console.error(`Failed to load analysis ${type} content:`, error);
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
  }, [currentAnalysis.name, displayName, isEnvMode, type, version]);

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let contentToSave = content;

      if (isEnvMode) {
        // Format environment variables before saving
        contentToSave = content
          .split('\n')
          .map((line) => {
            if (line.trim().startsWith('#') || line.trim() === '') {
              return line; // Keep comments and empty lines as they are
            }

            const [key, ...valueParts] = line.split('='); // Split only on first `=`
            if (!key || valueParts.length === 0) return ''; // Ignore invalid lines

            const formattedKey = key.trim().replace(/\s+/g, '_').toUpperCase(); // Normalize key
            const formattedValue = valueParts.join('=').trim(); // Preserve values

            return `${formattedKey}=${formattedValue}`;
          })
          .join('\n');

        await notify.executeWithNotification(
          analysisService.updateAnalysisENV(
            currentAnalysis.name,
            contentToSave,
          ),
          {
            loading: `Updating environment for ${currentAnalysis.name}...`,
            success: 'Environment variables updated successfully.',
          },
        );
      } else {
        await notify.updateAnalysis(
          analysisService.updateAnalysis(displayName, contentToSave),
          displayName,
        );
      }

      setHasChanges(false);
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
      setError(error.message || `Failed to update analysis ${type} content.`);
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

  const modalTitle = isEnvMode ? 'Environment' : 'Analysis Content';
  const nameToDisplay = isEnvMode ? currentAnalysis.name : displayName;
  const versionText = version !== null && version !== 0 ? ` (v${version})` : '';

  return (
    <Modal
      opened
      onClose={onClose}
      size="90%"
      title={
        <Group gap="xs">
          <Text fw={600}>
            {readOnly ? 'Viewing' : 'Editing'} {modalTitle}:
          </Text>
          {!isEnvMode && !readOnly && isEditingName ? (
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
                >
                  <IconEdit size={14} />
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

AnalysisEditModal.propTypes = {
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
  type: PropTypes.oneOf(['analysis', 'env']),
  version: PropTypes.number,
  showDiffToggle: PropTypes.bool,
};
