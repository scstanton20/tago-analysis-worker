/**
 * CodeMirror basic setup utilities (lightweight, no heavy dependencies)
 * @module utils/codeMirrorSetup
 */

import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { indentWithTab, defaultKeymap } from '@codemirror/commands';

/**
 * Custom read-only setup with line numbers and syntax highlighting
 */
export const readOnlySetup = [
  lineNumbers(),
  EditorView.lineWrapping,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

/**
 * Create format command for keyboard shortcut and Tab indentation
 * Includes defaultKeymap which provides Cmd+/ (Ctrl+/) for comment toggle
 */
export const editorKeymap = keymap.of([
  indentWithTab, // Enable Tab for indentation
  defaultKeymap,
]);
