/**
 * Reusable CodeMirror editor component with support for:
 * - JavaScript syntax highlighting and linting
 * - Read-only and editable modes
 * - Diff view mode for version comparison
 * - Auto-formatting with Prettier
 * - Theme switching (dark/light)
 * @module components/editor/CodeMirrorEditor
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { lintGutter } from '@codemirror/lint';
import { unifiedMergeView } from '@codemirror/merge';
import { useMantineColorScheme } from '@mantine/core';
import { vsCodeDark } from '@fsegurai/codemirror-theme-vscode-dark';
import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light';
import {
  readOnlySetup,
  editorKeymap,
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
  const themeCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const languageRef = useRef(language);
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange);
  const onViewReadyRef = useRef(onViewReady);
  const { colorScheme } = useMantineColorScheme();

  // Keep refs current - useLayoutEffect ensures refs are updated before any effects run
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    readOnlyRef.current = readOnly;
    languageRef.current = language;
    onDiagnosticsChangeRef.current = onDiagnosticsChange;
    onViewReadyRef.current = onViewReady;
  });

  // Create editor once on mount
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    // Get appropriate theme for CodeMirror (external library needs explicit theme objects)
    const theme =
      colorScheme === 'dark' ||
      (colorScheme === 'auto' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? vsCodeDark
        : vsCodeLight;

    if (diffMode && originalContent) {
      // Create unified diff view (inline diff)
      const extensions = [
        readOnlySetup, // Use consistent read-only setup for diff views
        themeCompartmentRef.current.of(theme),
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
        themeCompartmentRef.current.of(theme),
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

        // Add editor keymap (Tab indentation + format) and linting for editable JavaScript editors
        if (!readOnlyRef.current) {
          extensions.push(editorKeymap);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Create only once on mount

  // Update theme when colorScheme changes
  useEffect(() => {
    if (!viewRef.current || !themeCompartmentRef.current) return;

    const theme =
      colorScheme === 'dark' ||
      (colorScheme === 'auto' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? vsCodeDark
        : vsCodeLight;

    // Use dispatch with compartment reconfigure instead of destroying the editor
    // This is efficient and preserves all editor state
    viewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(theme),
    });
  }, [colorScheme]);

  // Update content when value changes externally (but not from user typing)
  useEffect(() => {
    if (viewRef.current && viewRef.current.state) {
      // For unified diff view, content updates should recreate the view
      // since we need to update the comparison
      if (diffMode && originalContent) {
        if (viewRef.current.state.doc.toString() !== value) {
          // Recreate the unified diff view with new content
          const parent = viewRef.current.dom.parentNode;
          // Get appropriate theme for CodeMirror (external library needs explicit theme objects)
          const theme =
            colorScheme === 'dark' ||
            (colorScheme === 'auto' &&
              window.matchMedia('(prefers-color-scheme: dark)').matches)
              ? vsCodeDark
              : vsCodeLight;

          viewRef.current.destroy();

          const extensions = [
            readOnlySetup, // Use consistent read-only setup for diff views
            themeCompartmentRef.current.of(theme),
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
    // colorScheme is intentionally excluded from dependencies.
    // Theme changes are handled by the separate effect (lines 187-202)
    // using dispatch with compartment.reconfigure. This prevents unnecessary
    // editor destruction when only the theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, diffMode, originalContent]);

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
