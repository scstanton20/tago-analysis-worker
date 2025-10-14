/**
 * Custom hook for managing analysis edit modal state and operations
 * Handles content loading, saving, renaming, and diff mode
 * @module hooks/useAnalysisEdit
 */

import { useState, useEffect, useCallback } from 'react';
import * as prettier from 'prettier';
import prettierPluginBabel from 'prettier/plugins/babel';
import prettierPluginEstree from 'prettier/plugins/estree';
import { analysisService } from '../services/analysisService';
import { checkFormatChanges } from '../utils/codeMirrorUtils';
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
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newFileName, setNewFileName] = useState(currentAnalysis.name);
  const [displayName, setDisplayName] = useState(currentAnalysis.name);
  const [diffMode, setDiffMode] = useState(false);
  const [currentContent, setCurrentContent] = useState('');
  const [formatCodeFn, setFormatCodeFn] = useState(null);
  const [hasFormatChanges, setHasFormatChanges] = useState(false);

  const isEnvMode = type === 'env';

  // Update analysis name when it changes via SSE (only for analysis mode)
  if (!isEnvMode && currentAnalysis.name !== newFileName && !isEditingName) {
    setNewFileName(currentAnalysis.name);
    setDisplayName(currentAnalysis.name);
  }

  /**
   * Handle editor content change
   */
  const handleEditorChange = useCallback((newContent) => {
    setContent(newContent);
    setHasChanges(true);
  }, []);

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
          logger.error('Failed to fetch current content for diff:', error);
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

  /**
   * Load content when component mounts or analysis changes
   */
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
        logger.error(`Failed to load analysis ${type} content:`, error);
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

  /**
   * Save analysis content with auto-formatting
   */
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
          logger.warn('Formatting failed, saving unformatted:', formatError);
          // Continue with unformatted content if formatting fails
          contentToSave = content;
        }

        await notify.updateAnalysis(
          analysisService.updateAnalysis(displayName, contentToSave),
          displayName,
        );
      }

      setHasChanges(false);
      return true; // Indicate successful save
    } catch (error) {
      logger.error('Save failed:', error);
      setError(error.message || `Failed to update analysis ${type} content.`);
      return false; // Indicate failed save
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Rename analysis
   */
  const handleRename = async () => {
    try {
      if (!newFileName.trim()) {
        setError('Filename cannot be empty');
        return false;
      }

      if (newFileName === displayName) {
        setIsEditingName(false);
        return true;
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
      return true;
    } catch (error) {
      logger.error('Rename failed:', error);
      setError(error.message || 'Failed to rename analysis.');
      // Reset the filename input to the current name if rename fails
      setNewFileName(displayName);
      return false;
    } finally {
      setIsLoading(false);
    }
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
    setError,
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
