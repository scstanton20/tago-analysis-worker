/**
 * Reusable CodeMirror editor component with support for:
 * - JavaScript syntax highlighting and linting
 * - Read-only and editable modes
 * - Diff view mode for version comparison
 * - Auto-formatting with Prettier
 * - Theme switching (dark/light)
 * @module components/editor/CodeMirrorEditor
 */

import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { lintGutter } from '@codemirror/lint';
import { unifiedMergeView } from '@codemirror/merge';
import { useMantineColorScheme } from '@mantine/core';
import { vsCodeDark } from '@fsegurai/codemirror-theme-vscode-dark';
import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light';
import {
  readOnlySetup,
  formatKeymap,
  createJavaScriptLinter,
  formatCode,
} from '../../utils/codeMirrorUtils';

/**
 * CodeMirror Editor Component
 * Provides a feature-rich code editor with linting, formatting, and diff capabilities
 */
export function CodeMirrorEditor({
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
    // This effect intentionally runs once on mount to create the editor.
    // It captures initial prop values (value, colorScheme, diffMode, originalContent).
    // Subsequent updates are handled by separate effects (lines 177-277, 279-339)
    // and refs (onChangeRef, readOnlyRef, etc.) to avoid expensive editor recreation.
    // This is a valid performance optimization pattern for expensive initialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Create only once on mount

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
