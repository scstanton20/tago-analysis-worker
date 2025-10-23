/**
 * Centralized notification service for displaying standardized notifications
 * across the application. This service can be imported and used from any context.
 *
 * ## When to Use This Service Directly:
 * - SSE context providers (non-React contexts that need notifications)
 * - Authentication contexts and providers
 * - Service workers or other non-component contexts
 * - Any context where you cannot use React hooks
 *
 * ## For React Components and Hooks:
 * Use the `useNotifications` hook instead, which provides:
 * - Fire-and-forget helpers (notify.success(), notify.error())
 * - Promise wrappers (notify.executeWithNotification())
 * - Operation presets (notify.uploadAnalysis(), notify.login())
 *
 * @example Direct Service Usage (SSE contexts, auth providers)
 * import { showSuccess, showError, showLoading, updateNotification } from '../../utils/notificationService';
 *
 * // Simple notifications
 * await showSuccess('Operation completed');
 * await showError('Something went wrong');
 *
 * // With custom title
 * await showSuccess('Team created successfully', 'Success');
 *
 * // Loading notification that gets updated
 * const id = await showLoading('Processing...', 'process-123');
 * // ... later
 * await updateNotification('process-123', {
 *   title: 'Complete',
 *   message: 'Processing finished',
 *   color: 'green',
 *   loading: false,
 *   autoClose: 3000
 * });
 *
 * @example React Component Usage (PREFERRED)
 * import { useNotifications } from '../../hooks/useNotifications';
 *
 * function MyComponent() {
 *   const notify = useNotifications();
 *
 *   const handleSave = async () => {
 *     try {
 *       await saveData();
 *       notify.success('Data saved successfully'); // Fire-and-forget
 *     } catch (error) {
 *       notify.error(error.message);
 *     }
 *   };
 *
 *   // Or use promise wrapper
 *   const handleUpload = () => {
 *     notify.executeWithNotification(uploadFile(file), {
 *       loading: 'Uploading...',
 *       success: 'Upload complete!',
 *     });
 *   };
 * }
 */

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
 * Display a success notification with a checkmark icon
 * @param {string} message - The notification message
 * @param {string} title - The notification title (default: 'Success')
 * @param {number} autoClose - Auto close delay in ms (default: 4000)
 * @returns {Promise<string>} The notification ID
 */
export const showSuccess = async (
  message,
  title = 'Success',
  autoClose = 4000,
) => {
  const notifications = await getNotificationsAPI();
  const { IconCheck } = await import('@tabler/icons-react');

  const id = `notification-success-${Date.now()}`;
  notifications.show({
    id,
    title,
    message,
    icon: <IconCheck size={16} />,
    color: 'green',
    autoClose,
  });

  return id;
};

/**
 * Display an error notification with an X icon
 * @param {string} message - The notification message
 * @param {string} title - The notification title (default: 'Error')
 * @param {number} autoClose - Auto close delay in ms (default: 6000)
 * @returns {Promise<string>} The notification ID
 */
export const showError = async (message, title = 'Error', autoClose = 6000) => {
  const notifications = await getNotificationsAPI();
  const { IconX } = await import('@tabler/icons-react');

  const id = `notification-error-${Date.now()}`;
  notifications.show({
    id,
    title,
    message,
    icon: <IconX size={16} />,
    color: 'red',
    autoClose,
  });

  return id;
};

/**
 * Display an info notification with an info circle icon
 * @param {string} message - The notification message
 * @param {string} title - The notification title (default: 'Info')
 * @param {number} autoClose - Auto close delay in ms (default: 4000)
 * @returns {Promise<string>} The notification ID
 */
export const showInfo = async (message, title = 'Info', autoClose = 4000) => {
  const notifications = await getNotificationsAPI();
  const { IconInfoCircle } = await import('@tabler/icons-react');

  const id = `notification-info-${Date.now()}`;
  notifications.show({
    id,
    title,
    message,
    icon: <IconInfoCircle size={16} />,
    color: 'blue',
    autoClose,
  });

  return id;
};

/**
 * Display a warning notification with a warning icon
 * @param {string} message - The notification message
 * @param {string} title - The notification title (default: 'Warning')
 * @param {number} autoClose - Auto close delay in ms (default: 5000)
 * @returns {Promise<string>} The notification ID
 */
export const showWarning = async (
  message,
  title = 'Warning',
  autoClose = 5000,
) => {
  const notifications = await getNotificationsAPI();
  const { IconAlertTriangle } = await import('@tabler/icons-react');

  const id = `notification-warning-${Date.now()}`;
  notifications.show({
    id,
    title,
    message,
    icon: <IconAlertTriangle size={16} />,
    color: 'orange',
    autoClose,
  });

  return id;
};

/**
 * Display a loading notification with a spinner icon
 * @param {string} message - The notification message
 * @param {string} id - Custom notification ID (optional, generated if not provided)
 * @param {string} title - The notification title (default: 'Loading')
 * @returns {Promise<string>} The notification ID
 */
export const showLoading = async (message, id = null, title = 'Loading') => {
  const notifications = await getNotificationsAPI();
  const { IconLoader } = await import('@tabler/icons-react');

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
 * Update an existing notification with new content
 * @param {string} id - The notification ID to update
 * @param {Object} options - Update options
 * @param {string} options.title - New title
 * @param {string} options.message - New message
 * @param {string} options.color - New color (green, red, blue, orange, etc.)
 * @param {Object} options.icon - New icon component
 * @param {boolean} options.loading - Whether to show loading spinner
 * @param {number} options.autoClose - Auto close delay in ms (false to keep open)
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
 * Hide/close a notification by ID
 * @param {string} id - The notification ID to hide
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
