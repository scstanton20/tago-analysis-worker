/**
 * Custom hook for managing analysis edit modal state and operations
 * Handles content loading, saving, renaming, and diff mode
 * @module hooks/useAnalysisEdit
 */

import { useState, useEffect, useCallback } from 'react';
import { analysisService } from '../services/analysisService';
import { useAsyncOperation, useAsyncMount } from './async';
import logger from '../utils/logger';

/**
 * Hook for managing analysis edit modal operations
 * @param {Object} params - Hook parameters
 * @param {Object} params.analysis - Current analysis object
 * @param {string} params.type - Type: 'analysis' or 'env'
 * @param {number|null} params.version - Version number for viewing specific versions
 * @param {Function} params.notify - Notification service
 * @param {boolean} params.readOnly - Whether editor is read-only
 * @returns {Object} Analysis edit state and handlers
 */
export function useAnalysisEdit({
  analysis: currentAnalysis,
  type = 'analysis',
  version = null,
  notify,
  readOnly = false,
}) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newFileName, setNewFileName] = useState(currentAnalysis.name);
  const [displayName, setDisplayName] = useState(currentAnalysis.name);
  const [diffMode, setDiffMode] = useState(false);
  const [currentContent, setCurrentContent] = useState('');
  const [formatCodeFn, setFormatCodeFn] = useState(null);
  const [hasFormatChanges, setHasFormatChanges] = useState(false);

  const isEnvMode = type === 'env';

  // Async operations
  const loadContentOperation = useAsyncOperation({
    onError: (error) =>
      logger.error(`Failed to load analysis ${type} content:`, error),
  });

  const loadDiffOperation = useAsyncOperation({
    onError: (error) =>
      logger.error('Failed to fetch current content for diff:', error),
  });

  const saveOperation = useAsyncOperation({
    onError: (error) => logger.error('Save failed:', error),
  });

  const renameOperation = useAsyncOperation({
    onError: (error) => logger.error('Rename failed:', error),
  });

  // Combined loading and error states
  const isLoading =
    loadContentOperation.loading ||
    loadDiffOperation.loading ||
    saveOperation.loading ||
    renameOperation.loading;

  const error =
    loadContentOperation.error ||
    loadDiffOperation.error ||
    saveOperation.error ||
    renameOperation.error;

  /**
   * Handle editor content change
   */
  const handleEditorChange = useCallback(
    (newContent) => {
      setContent(newContent);
      // Only mark as changed if content differs from original
      setHasChanges(newContent !== originalContent);
    },
    [originalContent],
  );

  /**
   * Check if prettier would make changes to the current content
   */
  useEffect(() => {
    if (isEnvMode || readOnly || !content) {
      setHasFormatChanges(false);
      return;
    }

    let isCancelled = false;

    async function checkFormat() {
      // Lazy load checkFormatChanges only when needed
      const { checkFormatChanges } = await import('../utils/codeMirrorUtils');
      const hasChanges = await checkFormatChanges(content);
      if (!isCancelled) {
        setHasFormatChanges(hasChanges);
      }
    }

    checkFormat();

    return () => {
      isCancelled = true;
    };
  }, [content, isEnvMode, readOnly]);

  /**
   * Store format function reference
   */
  const handleFormatReady = useCallback((formatFn) => {
    setFormatCodeFn(() => formatFn);
  }, []);

  /**
   * Trigger code formatting
   */
  const handleFormat = useCallback(async () => {
    if (formatCodeFn) {
      await formatCodeFn();
    }
  }, [formatCodeFn]);

  /**
   * Toggle diff mode and load current content if needed
   */
  const handleDiffToggle = useCallback(
    async (enabled) => {
      if (enabled && !currentContent) {
        await loadDiffOperation.execute(async () => {
          // Fetch current version content for comparison
          const current = await analysisService.getAnalysisContent(
            currentAnalysis.name,
            0,
          );
          setCurrentContent(current);
          setDiffMode(true);
        });
      } else {
        setDiffMode(enabled);
        if (!enabled) {
          setCurrentContent(''); // Clean up when diff is disabled
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAnalysis.name, currentContent],
  );

  /**
   * Load content when component mounts or analysis changes
   */
  useAsyncMount(
    async () => {
      const nameToUse = isEnvMode ? currentAnalysis.name : displayName;
      if (!nameToUse) return;

      const fileContent = isEnvMode
        ? await analysisService.getAnalysisENVContent(nameToUse)
        : await analysisService.getAnalysisContent(nameToUse, version);

      setContent(fileContent);
      setOriginalContent(fileContent);
      setHasChanges(false);
    },
    { deps: [currentAnalysis.name, displayName, isEnvMode, type, version] },
  );

  /**
   * Save analysis content with auto-formatting
   */
  const handleSave = async () => {
    const result = await saveOperation.execute(async () => {
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
          // Lazy load prettier and config only when saving
          const [prettier, { getPrettierConfig }] = await Promise.all([
            import('prettier'),
            import('../utils/prettierConfig'),
          ]);
          const prettierConfig = await getPrettierConfig();
          contentToSave = await prettier.format(content, prettierConfig);
        } catch (formatError) {
          logger.warn('Formatting failed, saving unformatted:', formatError);
          // Continue with unformatted content if formatting fails
          contentToSave = content;
        }

        await notify.updateAnalysis(
          analysisService.updateAnalysis(displayName, contentToSave),
          displayName,
        );
      }

      // Update original content to match saved content
      setOriginalContent(contentToSave);
      setHasChanges(false);
      return true; // Indicate successful save
    });

    // Return false if operation failed, otherwise return true
    return result !== undefined ? result : false;
  };

  /**
   * Rename analysis
   */
  const handleRename = async () => {
    if (!newFileName.trim()) {
      return false;
    }

    if (newFileName === displayName) {
      setIsEditingName(false);
      return true;
    }

    const result = await renameOperation.execute(async () => {
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
      return true;
    });

    // If rename failed, reset the filename input to the current name
    if (result === undefined) {
      setNewFileName(displayName);
      return false;
    }

    return result;
  };

  return {
    // State
    content,
    hasChanges,
    isLoading,
    error,
    isEditingName,
    newFileName,
    displayName,
    diffMode,
    currentContent,
    formatCodeFn,
    hasFormatChanges,
    isEnvMode,
    // Setters
    setIsEditingName,
    setNewFileName,
    // Handlers
    handleEditorChange,
    handleFormatReady,
    handleFormat,
    handleDiffToggle,
    handleSave,
    handleRename,
  };
}
