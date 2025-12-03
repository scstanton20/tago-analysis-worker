/**
 * Notification preset generators for common operation patterns.
 * Reduces duplication in notification configurations.
 */
import { showError } from './notificationService.jsx';

/**
 * Creates a preset for operations with a named entity (e.g., "Uploading analysis.js...")
 * @param {Function} executeWithNotification - The notification wrapper function
 * @param {string} verb - The action verb (e.g., "Upload", "Delete", "Update")
 * @param {string} [entityType=''] - Optional entity type prefix (e.g., "team", "file")
 * @returns {Function} Preset function that takes (promise, name)
 */
export const createEntityOperationPreset = (
  executeWithNotification,
  verb,
  entityType = '',
) => {
  const entity = entityType ? `${entityType} ` : '';
  const verbLower = verb.toLowerCase();
  const verbPast = verb.endsWith('e') ? `${verbLower}d` : `${verbLower}ed`;

  return (promise, name) =>
    executeWithNotification(promise, {
      loading: `${verb}ing ${entity}${name}...`,
      success: `${entity.charAt(0).toUpperCase() + entity.slice(1)}${name} ${verbPast} successfully.`,
    });
};

/**
 * Creates a preset for simple operations without parameters (e.g., "Signing in...")
 * @param {Function} executeWithNotification - The notification wrapper function
 * @param {Object} config - Configuration object
 * @param {string} config.loading - Loading message
 * @param {string} config.success - Success message
 * @returns {Function} Preset function that takes (promise)
 */
export const createSimpleOperationPreset = (
  executeWithNotification,
  { loading, success },
) => {
  return (promise) => executeWithNotification(promise, { loading, success });
};

/**
 * Creates a preset for operations that only show error notifications
 * (success is handled elsewhere, e.g., via SSE)
 * @param {string} errorMessage - Default error message
 * @returns {Function} Preset function that takes (promise)
 */
export const createErrorOnlyPreset = (errorMessage) => {
  return async (promise) => {
    try {
      const result = await promise;
      return result;
    } catch (err) {
      showError(err.message || errorMessage);
      throw err;
    }
  };
};

/**
 * Generates all standard operation presets for a given executeWithNotification function
 * @param {Function} executeWithNotification - The notification wrapper function
 * @returns {Object} Object containing all standard preset functions
 */
export const generateStandardPresets = (executeWithNotification) => {
  return {
    // Auth operations - simple presets with custom messages
    logout: createSimpleOperationPreset(executeWithNotification, {
      loading: 'Signing out...',
      success: 'You have been signed out successfully.',
    }),

    passwordChange: createSimpleOperationPreset(executeWithNotification, {
      loading: 'Updating password...',
      success: 'Password updated successfully.',
    }),

    profileUpdate: createSimpleOperationPreset(executeWithNotification, {
      loading: 'Updating profile...',
      success: 'Profile updated successfully.',
    }),

    // Analysis operations - entity-based presets
    uploadAnalysis: createEntityOperationPreset(
      executeWithNotification,
      'Upload',
    ),
    updateAnalysis: createEntityOperationPreset(
      executeWithNotification,
      'Update',
    ),
    deleteAnalysis: createEntityOperationPreset(
      executeWithNotification,
      'Delete',
    ),
    downloadAnalysis: createEntityOperationPreset(
      executeWithNotification,
      'Download',
    ),

    // Analysis operations with custom SSE handling - error-only presets
    runAnalysis: createErrorOnlyPreset('Failed to start analysis'),
    stopAnalysis: createErrorOnlyPreset('Failed to stop analysis'),

    // Team operations - entity-based presets with "team" prefix
    createTeam: createEntityOperationPreset(
      executeWithNotification,
      'Create',
      'team',
    ),
    updateTeam: createEntityOperationPreset(
      executeWithNotification,
      'Update',
      'team',
    ),
    deleteTeam: createEntityOperationPreset(
      executeWithNotification,
      'Delete',
      'team',
    ),

    // Log operations - entity-based presets with "logs" suffix
    downloadLogs: (promise, analysisName, timeRange = '') => {
      const timeInfo = timeRange ? ` (${timeRange})` : '';
      return executeWithNotification(promise, {
        loading: `Downloading logs for ${analysisName}${timeInfo}...`,
        success: 'Logs downloaded successfully.',
      });
    },

    deleteLogs: (promise, analysisName, timeRange = '') => {
      const timeInfo = timeRange ? ` (${timeRange})` : '';
      return executeWithNotification(promise, {
        loading: `Deleting logs for ${analysisName}${timeInfo}...`,
        success: 'Logs deleted successfully.',
      });
    },

    // Analysis movement operations
    moveAnalysis: (promise, analysisName, teamName) =>
      executeWithNotification(promise, {
        loading: `Moving ${analysisName} to ${teamName}...`,
        success: `${analysisName} moved to ${teamName} successfully.`,
      }),
  };
};
