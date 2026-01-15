/**
 * Centralized notification service using Mantine notifications.
 * This module provides both low-level notification APIs (for direct use in SSE/auth contexts)
 * and high-level preset functions (for common operations with loading/success/error transitions).
 *
 * ## Usage Patterns:
 *
 * ### 1. Fire-and-Forget Notifications (Most Common)
 * Use these when you just want to show a notification without needing the ID:
 * ```js
 * showSuccess('Operation completed');
 * showError('Something went wrong');
 * showInfo('FYI: Something happened');
 * showWarning('Be careful!');
 * ```
 *
 * ### 2. Async Functions with Direct Returns (Need Notification ID)
 * Use these when you need the notification ID for updates:
 * ```js
 * const id = await showLoading('Processing...');
 * // ... do work
 * await updateNotification(id, {
 *   message: 'Done!',
 *   color: 'green',
 *   loading: false
 * });
 * ```
 *
 * ### 3. Promise Wrapper (Best for Operations)
 * Automatically handles loading → success/error transitions:
 * ```js
 * await executeWithNotification(saveData(), {
 *   loading: 'Saving...',
 *   success: 'Saved successfully',
 *   error: 'Failed to save'  // optional, uses promise error message by default
 * });
 * ```
 *
 * ### 4. Operation Presets (Recommended for Common Operations)
 * Pre-configured wrappers for common operations:
 * ```js
 * await notificationService.uploadAnalysis(uploadPromise, 'my-analysis.js');
 * await notificationService.logout(logoutPromise);
 * await notificationService.createTeam(createPromise, 'My Team');
 * ```
 */
import {
  IconCheck,
  IconX,
  IconInfoCircle,
  IconAlertTriangle,
  IconLoader,
} from '@tabler/icons-react';
import { createLogger } from './logger.js';

const logger = createLogger('NotificationService');

// Dynamic import to avoid circular dependencies and ensure Mantine is initialized
let notificationsAPI = null;

const getNotificationsAPI = async () => {
  if (!notificationsAPI) {
    const { notifications } = await import('@mantine/notifications');
    notificationsAPI = notifications;
  }
  return notificationsAPI;
};

/**
 * Configuration for different notification types
 */
const NOTIFICATION_CONFIGS = {
  success: {
    icon: IconCheck,
    color: 'green',
    defaultTitle: 'Success',
    defaultAutoClose: 4000,
  },
  error: {
    icon: IconX,
    color: 'red',
    defaultTitle: 'Error',
    defaultAutoClose: 6000,
  },
  info: {
    icon: IconInfoCircle,
    color: 'blue',
    defaultTitle: 'Info',
    defaultAutoClose: 4000,
  },
  warning: {
    icon: IconAlertTriangle,
    color: 'orange',
    defaultTitle: 'Warning',
    defaultAutoClose: 5000,
  },
};

/**
 * Internal helper to show typed notification
 * @param {string} type - Notification type
 * @param {string} message - Message
 * @param {string} title - Title
 * @param {number} autoClose - Auto close delay
 * @returns {Promise<string>} Notification ID
 */
const showTypedNotification = async (type, message, title, autoClose) => {
  const config = NOTIFICATION_CONFIGS[type];
  const notifications = await getNotificationsAPI();
  const IconComponent = config.icon;

  const id = `notification-${type}-${Date.now()}`;
  notifications.show({
    id,
    title: title ?? config.defaultTitle,
    message,
    icon: <IconComponent size={16} />,
    color: config.color,
    autoClose: autoClose ?? config.defaultAutoClose,
  });

  return id;
};

/** Show success notification */
export const showSuccess = (message, title, autoClose) =>
  showTypedNotification('success', message, title, autoClose);

/** Show error notification */
export const showError = (message, title, autoClose) =>
  showTypedNotification('error', message, title, autoClose);

/** Show info notification */
export const showInfo = (message, title, autoClose) =>
  showTypedNotification('info', message, title, autoClose);

/** Show warning notification */
export const showWarning = (message, title, autoClose) =>
  showTypedNotification('warning', message, title, autoClose);

/**
 * Show loading notification
 * @param {string} message - Message
 * @param {string} id - Custom ID
 * @param {string} title - Title
 * @returns {Promise<string>} Notification ID
 */
export const showLoading = async (message, id = null, title = 'Loading') => {
  const notifications = await getNotificationsAPI();

  const notificationId = id || `notification-loading-${Date.now()}`;
  notifications.show({
    id: notificationId,
    title,
    message,
    icon: <IconLoader size={16} />,
    color: 'blue',
    loading: true,
    autoClose: false,
  });

  return notificationId;
};

/**
 * Update existing notification
 * @param {string} id - Notification ID
 * @param {Object} options - Update options
 * @returns {Promise<void>}
 */
export const updateNotification = async (id, options) => {
  const notifications = await getNotificationsAPI();

  notifications.update({
    id,
    ...options,
  });
};

/**
 * Hide notification by ID
 * @param {string} id - Notification ID
 * @returns {Promise<void>}
 */
export const hideNotification = async (id) => {
  const notifications = await getNotificationsAPI();
  notifications.hide(id);
};

/**
 * Show a notification with custom configuration
 * @param {Object} options - Notification options
 * @param {string} options.id - Custom notification ID
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.color - Notification color
 * @param {Object} options.icon - Icon component
 * @param {boolean} options.loading - Show loading spinner
 * @param {number|boolean} options.autoClose - Auto close delay or false
 * @returns {Promise<string>} The notification ID
 */
export const showNotification = async (options) => {
  const notifications = await getNotificationsAPI();
  const id = options.id || `notification-custom-${Date.now()}`;

  notifications.show({
    ...options,
    id,
  });

  return id;
};

/**
 * Execute a promise with automatic loading → success/error notification transitions.
 * This is the primary way to wrap async operations with notifications.
 *
 * @param {Promise} promise - The promise to wrap
 * @param {Object} options - Configuration options
 * @param {string} options.loading - Loading message (default: 'Processing...')
 * @param {string} options.success - Success message (default: 'Operation completed successfully')
 * @param {string} options.error - Error message (overrides promise error message if provided)
 * @returns {Promise} Result of the promise
 * @throws {Error} Re-throws the error from the promise after showing error notification
 *
 * @example
 * await executeWithNotification(updateUser(data), {
 *   loading: 'Updating user...',
 *   success: 'User updated successfully'
 * });
 */
export const executeWithNotification = async (
  promise,
  {
    loading = 'Processing...',
    success = 'Operation completed successfully',
    error,
  } = {},
) => {
  const id = `notification-${Date.now()}`;

  // Show loading notification
  await showLoading(loading, id, 'Loading');

  try {
    const result = await promise;

    // Update to success notification with icon
    try {
      await updateNotification(id, {
        title: 'Success',
        message: success,
        icon: <IconCheck size={16} />,
        color: 'green',
        loading: false,
        autoClose: 4000,
      });
    } catch (notifError) {
      // Log but don't throw - the operation succeeded even if notification failed
      logger.error('Failed to show success notification', {
        error: notifError,
      });
    }

    return result;
  } catch (err) {
    // Update to error notification with icon
    const errorMessage = error || err.message || 'An unexpected error occurred';

    try {
      await updateNotification(id, {
        title: 'Error',
        message: errorMessage,
        icon: <IconX size={16} />,
        color: 'red',
        loading: false,
        autoClose: 6000,
      });
    } catch (notifError) {
      // Log but don't prevent error from propagating
      logger.error('Failed to show error notification', {
        error: notifError,
      });
    }

    throw err;
  }
};

/**
 * Creates a preset for operations with a named entity (e.g., "Uploading analysis.js...")
 * @param {string} verb - The action verb (e.g., "Upload", "Delete", "Update")
 * @param {string} [entityType=''] - Optional entity type prefix (e.g., "team", "file")
 * @returns {Function} Preset function that takes (promise, name)
 */
const createEntityOperationPreset = (verb, entityType = '') => {
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
 * @param {Object} config - Configuration object
 * @param {string} config.loading - Loading message
 * @param {string} config.success - Success message
 * @returns {Function} Preset function that takes (promise)
 */
const createSimpleOperationPreset = ({ loading, success }) => {
  return (promise) => executeWithNotification(promise, { loading, success });
};

/**
 * Creates a preset for operations that only show error notifications
 * (success is handled elsewhere, e.g., via SSE)
 * @param {string} errorMessage - Default error message
 * @returns {Function} Preset function that takes (promise)
 */
const createErrorOnlyPreset = (errorMessage) => {
  return async (promise) => {
    try {
      const result = await promise;
      return result;
    } catch (err) {
      showError(err.message || errorMessage).catch((errToLog) =>
        logger.error('Failed to show error notification', {
          error: errToLog,
        }),
      );
      throw err;
    }
  };
};

/**
 * Higher-order function to create the notification API object.
 * This allows creating multiple instances if needed (though typically only one is used).
 * @returns {Object} Notification API with all presets and methods
 */
const createNotificationAPI = () => {
  // Fire-and-forget wrapper functions with error handling
  const successFn = (message, title = 'Success') => {
    showSuccess(message, title).catch((err) =>
      logger.error('Failed to show success notification', { error: err }),
    );
  };

  const errorFn = (message, title = 'Error') => {
    showError(message, title).catch((err) =>
      logger.error('Failed to show error notification', { error: err }),
    );
  };

  const infoFn = (message, title = 'Info') => {
    showInfo(message, title).catch((err) =>
      logger.error('Failed to show info notification', { error: err }),
    );
  };

  const warningFn = (message, title = 'Warning') => {
    showWarning(message, title).catch((err) =>
      logger.error('Failed to show warning notification', { error: err }),
    );
  };

  return {
    // Fire-and-forget helpers
    success: successFn,
    error: errorFn,
    info: infoFn,
    warning: warningFn,

    // Promise wrapper
    executeWithNotification,

    // Auth operations - simple presets with custom messages
    logout: createSimpleOperationPreset({
      loading: 'Signing out...',
      success: 'You have been signed out successfully.',
    }),

    passwordChange: createSimpleOperationPreset({
      loading: 'Updating password...',
      success: 'Password updated successfully.',
    }),

    profileUpdate: createSimpleOperationPreset({
      loading: 'Updating profile...',
      success: 'Profile updated successfully.',
    }),

    // Analysis operations - entity-based presets
    uploadAnalysis: createEntityOperationPreset('Upload'),
    updateAnalysis: createEntityOperationPreset('Update'),
    deleteAnalysis: createEntityOperationPreset('Delete'),
    downloadAnalysis: createEntityOperationPreset('Download'),

    // Analysis operations with custom SSE handling - error-only presets
    runAnalysis: createErrorOnlyPreset('Failed to start analysis'),
    stopAnalysis: createErrorOnlyPreset('Failed to stop analysis'),

    // Team operations - entity-based presets with "team" prefix
    createTeam: createEntityOperationPreset('Create', 'team'),
    updateTeam: createEntityOperationPreset('Update', 'team'),
    deleteTeam: createEntityOperationPreset('Delete', 'team'),

    // Log operations - entity-based presets with custom parameters
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

// Export the singleton notification API instance for use throughout the app
export const notificationAPI = createNotificationAPI();
