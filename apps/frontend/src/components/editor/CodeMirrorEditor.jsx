/**
 * Reusable CodeMirror editor component with support for:
 * - JavaScript syntax highlighting and linting
 * - Read-only and editable modes
 * - Diff view mode for version comparison
 * - Auto-formatting with Prettier
 * - Theme switching (dark/light)
 * @module components/editor/CodeMirrorEditor
 */

import { useEffect, useEffectEvent, useRef } from 'react';
import PropTypes from 'prop-types';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
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
  const currentDiffValueRef = useRef(null);
  const currentDiffOriginalRef = useRef(null);
  const { colorScheme } = useMantineColorScheme();

  const handleChange = useEffectEvent(onChange || (() => {}));
  const handleDiagnosticsChange = useEffectEvent(
    onDiagnosticsChange || (() => {}),
  );
  const handleViewReady = useEffectEvent(onViewReady || (() => {}));
  const handleFormatReady = useEffectEvent(onFormatReady || (() => {}));

  // Stable functions to read current props without triggering effect re-runs
  // This allows mount-only effects to access the latest prop values
  const getTheme = useEffectEvent(() => {
    return colorScheme === 'dark' ||
      (colorScheme === 'auto' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? vsCodeDark
      : vsCodeLight;
  });
  const getLanguage = useEffectEvent(() => language);
  const getDiffMode = useEffectEvent(() => diffMode);
  const getOriginalContent = useEffectEvent(() => originalContent);
  const getValue = useEffectEvent(() => value);
  const getReadOnly = useEffectEvent(() => readOnly);

  // Create editor once on mount
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    // Get initial prop values via useEffectEvent
    const theme = getTheme();
    const currentDiffMode = getDiffMode();
    const currentOriginalContent = getOriginalContent();
    const currentValue = getValue();
    const currentLanguage = getLanguage();
    const currentReadOnly = getReadOnly();

    if (currentDiffMode && currentOriginalContent) {
      // Create unified diff view (inline diff)
      const extensions = [
        readOnlySetup, // Use consistent read-only setup for diff views
        themeCompartmentRef.current.of(theme),
        unifiedMergeView({
          original: currentValue || '', // Current version as original
          mergeControls: false, // Disable accept/reject controls for read-only viewing
          collapseUnchanged: { margin: 3, minSize: 4 }, // Collapse unchanged lines
        }),
      ];

      // Add language support
      if (currentLanguage === 'javascript') {
        extensions.push(javascript());
      } else if (currentLanguage === 'markdown') {
        // Remove HTML parsers to avoid MixedParse crash when typing near HTML comments
        // The comment tokens (<!-- -->) are still defined at the language level
        extensions.push(
          markdown({ extensions: { remove: ['HTMLBlock', 'HTMLTag'] } }),
        );
      }

      const state = EditorState.create({
        doc: currentOriginalContent || '', // Previous version content as the document
        extensions,
      });

      const view = new EditorView({
        state,
        parent: editorRef.current,
      });

      viewRef.current = view;
      currentDiffValueRef.current = currentValue;
      currentDiffOriginalRef.current = currentOriginalContent;

      // Expose view to parent component
      handleViewReady(view);
    } else {
      // Create regular editor
      const extensions = [
        currentReadOnly ? readOnlySetup : basicSetup,
        themeCompartmentRef.current.of(theme),
      ];

      // Add update listener for editable editors
      if (!currentReadOnly) {
        extensions.push(
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newContent = update.state.doc.toString();
              handleChange(newContent);
            }
          }),
        );
      }

      // Add language support
      if (currentLanguage === 'javascript') {
        extensions.push(javascript());

        // Add editor keymap (Tab indentation + format) and linting for editable JavaScript editors
        if (!currentReadOnly) {
          extensions.push(editorKeymap);
          extensions.push(lintGutter());
          extensions.push(createJavaScriptLinter(handleDiagnosticsChange));
        }
      } else if (currentLanguage === 'markdown') {
        // Remove HTML parsers to avoid MixedParse crash when typing near HTML comments
        extensions.push(
          markdown({ extensions: { remove: ['HTMLBlock', 'HTMLTag'] } }),
        );

        // Add editor keymap for markdown (Tab indentation + comment toggle with Cmd+/)
        if (!currentReadOnly) {
          extensions.push(editorKeymap);
        }
      }

      const state = EditorState.create({
        doc: currentValue || '',
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
      !currentReadOnly &&
      currentLanguage === 'javascript' &&
      !currentDiffMode
    ) {
      handleFormatReady(() => formatCode(viewRef.current));
    }

    // Expose view to parent component
    if (viewRef.current) {
      handleViewReady(viewRef.current);
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []); // Mount-only effect - all external dependencies handled via useEffectEvent

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
        // Only recreate if the actual diff values have changed
        const valueChanged = currentDiffValueRef.current !== value;
        const originalChanged =
          currentDiffOriginalRef.current !== originalContent;

        if (valueChanged || originalChanged) {
          // Recreate the unified diff view with new content
          const parent = viewRef.current.dom.parentNode;
          // Get appropriate theme for CodeMirror (external library needs explicit theme objects)
          const theme = getTheme();

          viewRef.current.destroy();

          const extensions = [
            readOnlySetup, // Use consistent read-only setup for diff views
            themeCompartmentRef.current.of(theme),
            unifiedMergeView({
              original: value || '', // Older version as original
              mergeControls: false, // Disable accept/reject controls
              collapseUnchanged: { margin: 3, minSize: 4 }, // Collapse unchanged lines
            }),
          ];

          if (getLanguage() === 'javascript') {
            extensions.push(javascript());
          } else if (getLanguage() === 'markdown') {
            // Remove HTML parsers to avoid MixedParse crash
            extensions.push(
              markdown({ extensions: { remove: ['HTMLBlock', 'HTMLTag'] } }),
            );
          }

          const state = EditorState.create({
            doc: originalContent || '', // Current version as document
            extensions,
          });

          const view = new EditorView({
            state,
            parent,
          });

          viewRef.current = view;
          currentDiffValueRef.current = value;
          currentDiffOriginalRef.current = originalContent;

          // Expose view to parent component
          handleViewReady(view);
        }
      } else {
        // Regular editor - just update content
        // Reset diff tracking refs when not in diff mode
        currentDiffValueRef.current = null;
        currentDiffOriginalRef.current = null;

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
  }, [value, diffMode, originalContent]); // colorScheme and language accessed via useEffectEvent

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
  language: PropTypes.oneOf(['javascript', 'markdown', 'plaintext']),
  height: PropTypes.string,
  diffMode: PropTypes.bool,
  originalContent: PropTypes.string,
  onFormatReady: PropTypes.func,
  onDiagnosticsChange: PropTypes.func,
  onViewReady: PropTypes.func,
};
