/**
 * Custom hook for managing ESLint diagnostics navigation in CodeMirror
 * Handles diagnostic state, navigation, and editor view interaction
 * @module hooks/useDiagnostics
 */

import { useState, useCallback, useRef } from 'react';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Hook for managing diagnostic navigation in CodeMirror editor
 * @returns {Object} Diagnostic state and navigation functions
 */
export function useDiagnostics() {
  const [diagnostics, setDiagnostics] = useState([]);
  const [currentDiagnosticIndex, setCurrentDiagnosticIndex] = useState(0);
  const editorViewRef = useRef(null);

  // Count errors and warnings
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter(
    (d) => d.severity === 'warning',
  ).length;

  /**
   * Handle diagnostics change from linter
   */
  const handleDiagnosticsChange = useCallback((newDiagnostics) => {
    setDiagnostics(newDiagnostics);
    setCurrentDiagnosticIndex(0);
  }, []);

  /**
   * Store editor view reference for scrolling
   */
  const handleViewReady = useCallback((view) => {
    editorViewRef.current = view;
  }, []);

  /**
   * Scroll to a specific diagnostic in the editor
   */
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

  /**
   * Navigate to the next diagnostic
   */
  const navigateToNextDiagnostic = useCallback(() => {
    if (diagnostics.length === 0) return;
    const nextIndex = (currentDiagnosticIndex + 1) % diagnostics.length;
    setCurrentDiagnosticIndex(nextIndex);
    scrollToDiagnostic(nextIndex);
  }, [diagnostics.length, currentDiagnosticIndex, scrollToDiagnostic]);

  /**
   * Navigate to the previous diagnostic
   */
  const navigateToPrevDiagnostic = useCallback(() => {
    if (diagnostics.length === 0) return;
    const prevIndex =
      currentDiagnosticIndex === 0
        ? diagnostics.length - 1
        : currentDiagnosticIndex - 1;
    setCurrentDiagnosticIndex(prevIndex);
    scrollToDiagnostic(prevIndex);
  }, [diagnostics.length, currentDiagnosticIndex, scrollToDiagnostic]);

  return {
    diagnostics,
    errorCount,
    warningCount,
    currentDiagnosticIndex,
    handleDiagnosticsChange,
    handleViewReady,
    navigateToNextDiagnostic,
    navigateToPrevDiagnostic,
  };
}
