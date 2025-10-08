import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { basicSetup } from 'codemirror';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { EditorState, EditorSelection } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { linter, lintGutter } from '@codemirror/lint';
import { unifiedMergeView } from '@codemirror/merge';
import { useMantineColorScheme } from '@mantine/core';
import { vsCodeDark } from '@fsegurai/codemirror-theme-vscode-dark';
import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light';
import * as prettier from 'prettier';
import prettierPluginBabel from 'prettier/plugins/babel';
import prettierPluginEstree from 'prettier/plugins/estree';
import { Linter } from 'eslint-linter-browserify';

// Custom read-only setup with line numbers and syntax highlighting
const readOnlySetup = [
  lineNumbers(),
  EditorView.lineWrapping,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

// Format code using Prettier
async function formatCode(view) {
  try {
    const code = view.state.doc.toString();
    const formatted = await prettier.format(code, {
      parser: 'babel',
      plugins: [prettierPluginBabel, prettierPluginEstree],
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: 'all',
    });

    // Replace entire document with formatted code
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: formatted,
      },
    });

    return true;
  } catch (error) {
    console.error('Formatting error:', error);
    return false;
  }
}

// Create format command for keyboard shortcut
const formatKeymap = keymap.of([
  {
    key: 'Mod-Shift-f', // Ctrl+Shift+F on Windows/Linux, Cmd+Shift+F on Mac
    run: (view) => {
      formatCode(view);
      return true;
    },
  },
]);

// Create ESLint configuration for linting
const eslintConfig = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: {
        jsx: false,
      },
    },
    globals: {
      console: 'readonly',
      process: 'readonly',
      // Tago SDK globals available in analysis context
      context: 'readonly',
      account: 'readonly',
      device: 'readonly',
      analysis: 'readonly',
      scope: 'readonly',
    },
  },
  rules: {
    'no-undef': 'warn',
    'no-unused-vars': 'warn',
    'no-redeclare': 'error',
    'no-const-assign': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'warn',
    'no-empty': 'warn',
    'no-debugger': 'warn',
    semi: ['warn', 'always'],
    quotes: ['warn', 'single'],
  },
};

// Initialize ESLint linter for browser
const eslintLinter = new Linter({ configType: 'flat' });

// Create CodeMirror linter using ESLint with callback for diagnostics
const createJavaScriptLinter = (onDiagnosticsChange) =>
  linter((view) => {
    const diagnostics = [];
    const code = view.state.doc.toString();

    try {
      const messages = eslintLinter.verify(code, eslintConfig);

      for (const message of messages) {
        const line = view.state.doc.line(message.line);
        const from = line.from + (message.column - 1);
        const to = message.endLine
          ? view.state.doc.line(message.endLine).from + (message.endColumn - 1)
          : from + 1;

        diagnostics.push({
          from,
          to,
          severity: message.severity === 2 ? 'error' : 'warning',
          message: message.message,
          source: 'eslint',
          line: message.line,
        });
      }
    } catch (error) {
      console.error('Linting error:', error);
    }

    // Notify parent of diagnostic changes
    if (onDiagnosticsChange) {
      onDiagnosticsChange(diagnostics);
    }

    return diagnostics;
  });

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

// Reusable CodeMirror editor component
function CodeMirrorEditor({
  value = '',
  onChange,
  readOnly = false,
  language = 'javascript',
  height = '100%',
  diffMode = false,
  originalContent = '',
  onFormatReady, // Callback to expose format function to parent
  onDiagnosticsChange, // Callback when lint diagnostics change
  onViewReady, // Callback to expose editor view to parent
}) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const languageRef = useRef(language);
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange);
  const onViewReadyRef = useRef(onViewReady);
  const { colorScheme } = useMantineColorScheme();

  // Keep refs current
  useEffect(() => {
    onChangeRef.current = onChange;
    readOnlyRef.current = readOnly;
    languageRef.current = language;
    onDiagnosticsChangeRef.current = onDiagnosticsChange;
    onViewReadyRef.current = onViewReady;
  });

  // Create editor once on mount
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    // Determine theme based on current color scheme
    const isDark =
      colorScheme === 'dark' ||
      (colorScheme === 'auto' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (diffMode && originalContent) {
      // Create unified diff view (inline diff)
      const extensions = [
        readOnlySetup, // Use consistent read-only setup for diff views
        isDark ? vsCodeDark : vsCodeLight,
        unifiedMergeView({
          original: value || '', // Current version as original
          mergeControls: false, // Disable accept/reject controls for read-only viewing
          collapseUnchanged: { margin: 3, minSize: 4 }, // Collapse unchanged lines
        }),
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

      // Expose view to parent component
      if (onViewReadyRef.current) {
        onViewReadyRef.current(view);
      }
    } else {
      // Create regular editor
      const extensions = [
        readOnlyRef.current ? readOnlySetup : basicSetup,
        isDark ? vsCodeDark : vsCodeLight,
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

        // Add format keymap and linting for editable JavaScript editors
        if (!readOnlyRef.current) {
          extensions.push(formatKeymap);
          extensions.push(lintGutter());
          extensions.push(
            createJavaScriptLinter(onDiagnosticsChangeRef.current),
          );
        }
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

    // Expose format function to parent component
    if (
      onFormatReady &&
      !readOnlyRef.current &&
      languageRef.current === 'javascript' &&
      !diffMode
    ) {
      onFormatReady(() => formatCode(viewRef.current));
    }

    // Expose view to parent component
    if (onViewReadyRef.current && viewRef.current) {
      onViewReadyRef.current(viewRef.current);
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
          readOnlySetup, // Use consistent read-only setup for diff views
          isDark ? vsCodeDark : vsCodeLight,
          unifiedMergeView({
            original: currentContent || '', // Current version as original
            mergeControls: false, // Disable accept/reject controls
            collapseUnchanged: { margin: 3, minSize: 4 }, // Collapse unchanged lines
          }),
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

        // Expose view to parent component
        if (onViewReadyRef.current) {
          onViewReadyRef.current(view);
        }
      } else {
        // Recreate regular editor
        const extensions = [
          readOnlyRef.current ? readOnlySetup : basicSetup,
          isDark ? vsCodeDark : vsCodeLight,
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

          // Add format keymap and linting for editable JavaScript editors
          if (!readOnlyRef.current) {
            extensions.push(formatKeymap);
            extensions.push(lintGutter());
            extensions.push(
              createJavaScriptLinter(onDiagnosticsChangeRef.current),
            );
          }
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

        // Expose view to parent component
        if (onViewReadyRef.current) {
          onViewReadyRef.current(view);
        }
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

          viewRef.current.destroy();

          const extensions = [
            readOnlySetup, // Use consistent read-only setup for diff views
            isDark ? vsCodeDark : vsCodeLight,
            unifiedMergeView({
              original: value || '', // Current version as original
              mergeControls: false, // Disable accept/reject controls
              collapseUnchanged: { margin: 3, minSize: 4 }, // Collapse unchanged lines
            }),
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

          // Expose view to parent component
          if (onViewReadyRef.current) {
            onViewReadyRef.current(view);
          }
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
      style={{
        height,
        width: '100%',
        overflow: 'auto',
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
  onFormatReady: PropTypes.func,
  onDiagnosticsChange: PropTypes.func,
  onViewReady: PropTypes.func,
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
  const [formatCodeFn, setFormatCodeFn] = useState(null);
  const [diagnostics, setDiagnostics] = useState([]);
  const [currentDiagnosticIndex, setCurrentDiagnosticIndex] = useState(0);
  const [hasFormatChanges, setHasFormatChanges] = useState(false);
  const editorViewRef = useRef(null);

  const notify = useNotifications();
  const isEnvMode = type === 'env';

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter(
    (d) => d.severity === 'warning',
  ).length;

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

  // Check if prettier would make changes to the current content
  useEffect(() => {
    if (isEnvMode || readOnly || !content) {
      setHasFormatChanges(false);
      return;
    }

    let isCancelled = false;

    async function checkFormatChanges() {
      try {
        const formatted = await prettier.format(content, {
          parser: 'babel',
          plugins: [prettierPluginBabel, prettierPluginEstree],
          semi: true,
          singleQuote: true,
          tabWidth: 2,
          trailingComma: 'all',
        });

        if (!isCancelled) {
          setHasFormatChanges(formatted !== content);
        }
      } catch {
        // If formatting fails, disable format button
        if (!isCancelled) {
          setHasFormatChanges(false);
        }
      }
    }

    checkFormatChanges();

    return () => {
      isCancelled = true;
    };
  }, [content, isEnvMode, readOnly]);

  const handleFormatReady = useCallback((formatFn) => {
    setFormatCodeFn(() => formatFn);
  }, []);

  const handleFormat = useCallback(async () => {
    if (formatCodeFn) {
      await formatCodeFn();
    }
  }, [formatCodeFn]);

  const handleDiagnosticsChange = useCallback((newDiagnostics) => {
    setDiagnostics(newDiagnostics);
    setCurrentDiagnosticIndex(0);
  }, []);

  const scrollToDiagnostic = useCallback(
    (index) => {
      if (!editorViewRef.current || !diagnostics[index]) {
        return;
      }

      const diagnostic = diagnostics[index];
      const view = editorViewRef.current;

      // Scroll to diagnostic with positioning 2 rows from bottom
      view.dispatch({
        selection: EditorSelection.cursor(diagnostic.from),
        effects: EditorView.scrollIntoView(diagnostic.from, {
          y: 'end',
          yMargin: view.defaultLineHeight * 2,
        }),
      });

      view.focus();
    },
    [diagnostics],
  );

  const navigateToNextDiagnostic = useCallback(() => {
    if (diagnostics.length === 0) return;
    const nextIndex = (currentDiagnosticIndex + 1) % diagnostics.length;
    setCurrentDiagnosticIndex(nextIndex);
    scrollToDiagnostic(nextIndex);
  }, [diagnostics.length, currentDiagnosticIndex, scrollToDiagnostic]);

  const navigateToPrevDiagnostic = useCallback(() => {
    if (diagnostics.length === 0) return;
    const prevIndex =
      currentDiagnosticIndex === 0
        ? diagnostics.length - 1
        : currentDiagnosticIndex - 1;
    setCurrentDiagnosticIndex(prevIndex);
    scrollToDiagnostic(prevIndex);
  }, [diagnostics.length, currentDiagnosticIndex, scrollToDiagnostic]);

  const handleViewReady = useCallback((view) => {
    editorViewRef.current = view;
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
        // Auto-format JavaScript before saving
        try {
          contentToSave = await prettier.format(content, {
            parser: 'babel',
            plugins: [prettierPluginBabel, prettierPluginEstree],
            semi: true,
            singleQuote: true,
            tabWidth: 2,
            trailingComma: 'all',
          });
        } catch (formatError) {
          console.warn('Formatting failed, saving unformatted:', formatError);
          // Continue with unformatted content if formatting fails
          contentToSave = content;
        }

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
                        disabled={diagnostics.length === 0}
                        size="sm"
                      >
                        <IconChevronUp size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Next issue">
                      <ActionIcon
                        variant="subtle"
                        onClick={navigateToNextDiagnostic}
                        disabled={diagnostics.length === 0}
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
                onClick={handleSave}
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
