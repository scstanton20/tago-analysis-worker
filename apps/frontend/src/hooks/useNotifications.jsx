import {
  showSuccess,
  showError,
  showInfo,
  showWarning,
  showLoading,
  updateNotification,
  hideNotification,
  showNotification,
} from '../utils/notificationService.jsx';

/**
 * Notification hook that provides notification utilities and promise-based operation helpers.
 * This is the PREFERRED way to show notifications in React components and custom hooks.
 *
 * ## Usage Patterns:
 *
 * ### 1. Fire-and-Forget Notifications (Most Common)
 * Use these when you just want to show a notification without needing the ID:
 * ```js
 * const notify = useNotifications();
 *
 * // Simple success/error - no await needed
 * notify.success('Operation completed');
 * notify.error('Something went wrong');
 * notify.info('FYI: Something happened');
 * notify.warning('Be careful!');
 * ```
 *
 * ### 2. Async Functions with Direct Returns (Need Notification ID)
 * Use these when you need the notification ID for updates:
 * ```js
 * const id = await notify.showLoading('Processing...');
 * // ... do work
 * await notify.updateNotification(id, {
 *   message: 'Done!',
 *   color: 'green',
 *   loading: false
 * });
 * ```
 *
 * ### 3. Promise Wrapper (Best for Operations)
 * Automatically handles loading → success/error transitions:
 * ```js
 * await notify.executeWithNotification(saveData(), {
 *   loading: 'Saving...',
 *   success: 'Saved successfully',
 *   error: 'Failed to save'  // optional, uses promise error message by default
 * });
 * ```
 *
 * ### 4. Operation Presets (Recommended for Common Operations)
 * Pre-configured wrappers for common operations:
 * ```js
 * await notify.uploadAnalysis(uploadPromise, 'my-analysis.js');
 * await notify.login(loginPromise);
 * await notify.createTeam(createPromise, 'My Team');
 * ```
 *
 * ## Available Methods:
 *
 * ### Fire-and-Forget Helpers (void, no await needed):
 * - `notify.success(message, title?)` - Green checkmark notification
 * - `notify.error(message, title?)` - Red X notification
 * - `notify.info(message, title?)` - Blue info notification
 * - `notify.warning(message, title?)` - Orange warning notification
 *
 * ### Async Functions (return notification ID):
 * - `notify.showSuccess(message, title?, autoClose?)` - Returns ID
 * - `notify.showError(message, title?, autoClose?)` - Returns ID
 * - `notify.showInfo(message, title?, autoClose?)` - Returns ID
 * - `notify.showWarning(message, title?, autoClose?)` - Returns ID
 * - `notify.showLoading(message, id?, title?)` - Returns ID
 * - `notify.updateNotification(id, options)` - Updates existing notification
 * - `notify.hideNotification(id)` - Hides notification
 *
 * ### Promise Wrapper:
 * - `notify.executeWithNotification(promise, options)` - Wraps promise with loading/success/error
 *
 * ### Operation Presets:
 * Auth: login, logout, passwordChange, profileUpdate
 * Analysis: uploadAnalysis, runAnalysis, stopAnalysis, updateAnalysis, deleteAnalysis, downloadAnalysis
 * Teams: createTeam, updateTeam, deleteTeam
 *
 * @returns {Object} Notification utilities and helpers
 *
 * @example Simple notifications
 * const notify = useNotifications();
 * notify.success('Saved!');
 * notify.error('Failed to save');
 *
 * @example Promise wrapper
 * await notify.executeWithNotification(updateUser(data), {
 *   loading: 'Updating user...',
 *   success: 'User updated successfully'
 * });
 *
 * @example Operation presets
 * await notify.uploadAnalysis(upload(file), 'analysis.js');
 * await notify.createTeam(createTeamAPI(data), 'Engineering');
 */
export const useNotifications = () => {
  const executeWithNotification = async (
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
        const { IconCheck } = await import('@tabler/icons-react');
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
        console.error('Failed to show success notification:', notifError);
      }

      return result;
    } catch (err) {
      // Update to error notification with icon
      const errorMessage =
        error || err.message || 'An unexpected error occurred';

      try {
        const { IconX } = await import('@tabler/icons-react');
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
        console.error('Failed to show error notification:', notifError);
      }

      throw err;
    }
  };

  // Predefined notification presets for common operations
  const presets = {
    // Auth operations
    login: (promise) =>
      executeWithNotification(promise, {
        loading: 'Signing in...',
        success: 'Welcome back! You have been signed in successfully.',
      }),

    logout: (promise) =>
      executeWithNotification(promise, {
        loading: 'Signing out...',
        success: 'You have been signed out successfully.',
      }),

    passwordChange: (promise) =>
      executeWithNotification(promise, {
        loading: 'Updating password...',
        success: 'Password updated successfully.',
      }),

    profileUpdate: (promise) =>
      executeWithNotification(promise, {
        loading: 'Updating profile...',
        success: 'Profile updated successfully.',
      }),

    // Analysis operations
    uploadAnalysis: (promise, filename) =>
      executeWithNotification(promise, {
        loading: `Uploading ${filename}...`,
        success: `${filename} uploaded successfully.`,
      }),

    runAnalysis: async (promise) => {
      // Don't show success notification - SSE will handle actual start/fail notifications
      // Just execute the promise and let errors bubble up
      try {
        const result = await promise;
        return result;
      } catch (err) {
        // Show error notification only if API call fails
        const { showError } = await import('../utils/notificationService.jsx');
        await showError(err.message || 'Failed to start analysis');
        throw err;
      }
    },

    stopAnalysis: async (promise) => {
      // Don't show success notification - SSE will handle actual stop notifications
      // Just execute the promise and let errors bubble up
      try {
        const result = await promise;
        return result;
      } catch (err) {
        // Show error notification only if API call fails
        const { showError } = await import('../utils/notificationService.jsx');
        await showError(err.message || 'Failed to stop analysis');
        throw err;
      }
    },

    updateAnalysis: (promise, analysisName) =>
      executeWithNotification(promise, {
        loading: `Updating ${analysisName}...`,
        success: `${analysisName} updated successfully.`,
      }),

    deleteAnalysis: (promise, analysisName) =>
      executeWithNotification(promise, {
        loading: `Deleting ${analysisName}...`,
        success: `${analysisName} deleted successfully.`,
      }),

    downloadAnalysis: (promise, analysisName) =>
      executeWithNotification(promise, {
        loading: `Downloading ${analysisName}...`,
        success: `${analysisName} downloaded successfully.`,
      }),

    // Team operations
    createTeam: (promise, teamName) =>
      executeWithNotification(promise, {
        loading: `Creating team ${teamName}...`,
        success: `Team ${teamName} created successfully.`,
      }),

    updateTeam: (promise, teamName) =>
      executeWithNotification(promise, {
        loading: `Updating team ${teamName}...`,
        success: `Team ${teamName} updated successfully.`,
      }),

    deleteTeam: (promise, teamName) =>
      executeWithNotification(promise, {
        loading: `Deleting team ${teamName}...`,
        success: `Team ${teamName} deleted successfully.`,
      }),

    // Legacy department operations (for backward compatibility)
    createDepartment: (promise, departmentName) =>
      executeWithNotification(promise, {
        loading: `Creating team ${departmentName}...`,
        success: `Team ${departmentName} created successfully.`,
      }),

    updateDepartment: (promise, departmentName) =>
      executeWithNotification(promise, {
        loading: `Updating team ${departmentName}...`,
        success: `Team ${departmentName} updated successfully.`,
      }),

    deleteDepartment: (promise, departmentName) =>
      executeWithNotification(promise, {
        loading: `Deleting team ${departmentName}...`,
        success: `Team ${departmentName} deleted successfully.`,
      }),
  };

  // Fire-and-forget helper functions for simple notifications
  // These handle async internally and don't require await
  const success = (message, title = 'Success') => {
    showSuccess(message, title).catch(console.error);
  };

  const error = (message, title = 'Error') => {
    showError(message, title).catch(console.error);
  };

  const info = (message, title = 'Info') => {
    showInfo(message, title).catch(console.error);
  };

  const warning = (message, title = 'Warning') => {
    showWarning(message, title).catch(console.error);
  };

  return {
    // Direct access to service functions (async, return IDs)
    showSuccess,
    showError,
    showInfo,
    showWarning,
    showLoading,
    updateNotification,
    hideNotification,
    showNotification,

    // Fire-and-forget helpers (void, auto error handling)
    success,
    error,
    info,
    warning,

    // Promise wrapper
    executeWithNotification,

    // Operation presets
    ...presets,
  };
};

export default useNotifications;
