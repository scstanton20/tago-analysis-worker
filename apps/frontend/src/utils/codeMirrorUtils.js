/**
 * CodeMirror utility functions for code formatting and linting
 * @module utils/codeMirrorUtils
 */

import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { linter } from '@codemirror/lint';
import * as prettier from 'prettier';
import prettierPluginBabel from 'prettier/plugins/babel';
import prettierPluginEstree from 'prettier/plugins/estree';
import { Linter } from 'eslint-linter-browserify';
import { eslintConfig } from '../config/eslintConfig';
import logger from './logger';

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
 * Format code using Prettier
 * @param {EditorView} view - The CodeMirror editor view
 * @returns {Promise<boolean>} Whether formatting was successful
 */
export async function formatCode(view) {
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
    logger.error('Formatting error:', error);
    return false;
  }
}

/**
 * Create format command for keyboard shortcut
 */
export const formatKeymap = keymap.of([
  {
    key: 'Mod-Shift-f', // Ctrl+Shift+F on Windows/Linux, Cmd+Shift+F on Mac
    run: (view) => {
      formatCode(view);
      return true;
    },
  },
]);

/**
 * Initialize ESLint linter for browser
 */
export const eslintLinter = new Linter({ configType: 'flat' });

/**
 * Create CodeMirror linter using ESLint with callback for diagnostics
 * @param {Function} onDiagnosticsChange - Callback when diagnostics change
 * @returns {Extension} CodeMirror linter extension
 */
export const createJavaScriptLinter = (onDiagnosticsChange) =>
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
      logger.error('Linting error:', error);
    }

    // Notify parent of diagnostic changes
    if (onDiagnosticsChange) {
      onDiagnosticsChange(diagnostics);
    }

    return diagnostics;
  });

/**
 * Check if prettier would make changes to the content
 * @param {string} content - The code content to check
 * @returns {Promise<boolean>} Whether formatting would make changes
 */
export async function checkFormatChanges(content) {
  if (!content) return false;

  try {
    const formatted = await prettier.format(content, {
      parser: 'babel',
      plugins: [prettierPluginBabel, prettierPluginEstree],
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: 'all',
    });

    return formatted !== content;
  } catch {
    // If formatting fails, return false
    return false;
  }
}
