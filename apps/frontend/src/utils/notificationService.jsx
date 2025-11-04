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
 * Configuration for different notification types
 * @type {Object.<string, {iconName: string, color: string, defaultTitle: string, defaultAutoClose: number}>}
 */
const NOTIFICATION_CONFIGS = {
  success: {
    iconName: 'IconCheck',
    color: 'green',
    defaultTitle: 'Success',
    defaultAutoClose: 4000,
  },
  error: {
    iconName: 'IconX',
    color: 'red',
    defaultTitle: 'Error',
    defaultAutoClose: 6000,
  },
  info: {
    iconName: 'IconInfoCircle',
    color: 'blue',
    defaultTitle: 'Info',
    defaultAutoClose: 4000,
  },
  warning: {
    iconName: 'IconAlertTriangle',
    color: 'orange',
    defaultTitle: 'Warning',
    defaultAutoClose: 5000,
  },
};

/**
 * Map of icon names to their dynamic imports
 * This allows us to import only the specific icons we need
 * @private
 */
const ICON_IMPORTS = {
  IconCheck: () => import('@tabler/icons-react').then((m) => m.IconCheck),
  IconX: () => import('@tabler/icons-react').then((m) => m.IconX),
  IconInfoCircle: () =>
    import('@tabler/icons-react').then((m) => m.IconInfoCircle),
  IconAlertTriangle: () =>
    import('@tabler/icons-react').then((m) => m.IconAlertTriangle),
};

/**
 * Internal helper to show a typed notification
 * @private
 * @param {string} type - Notification type (success, error, info, warning)
 * @param {string} message - The notification message
 * @param {string} title - The notification title (optional, uses default if not provided)
 * @param {number} autoClose - Auto close delay in ms (optional, uses default if not provided)
 * @returns {Promise<string>} The notification ID
 */
const showTypedNotification = async (type, message, title, autoClose) => {
  const config = NOTIFICATION_CONFIGS[type];
  const notifications = await getNotificationsAPI();
  const IconComponent = await ICON_IMPORTS[config.iconName]();

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

/**
 * Display a success notification with a checkmark icon
 * @param {string} message - The notification message
 * @param {string} title - The notification title (default: 'Success')
 * @param {number} autoClose - Auto close delay in ms (default: 4000)
 * @returns {Promise<string>} The notification ID
 */
export const showSuccess = (message, title, autoClose) =>
  showTypedNotification('success', message, title, autoClose);

/**
 * Display an error notification with an X icon
 * @param {string} message - The notification message
 * @param {string} title - The notification title (default: 'Error')
 * @param {number} autoClose - Auto close delay in ms (default: 6000)
 * @returns {Promise<string>} The notification ID
 */
export const showError = (message, title, autoClose) =>
  showTypedNotification('error', message, title, autoClose);

/**
 * Display an info notification with an info circle icon
 * @param {string} message - The notification message
 * @param {string} title - The notification title (default: 'Info')
 * @param {number} autoClose - Auto close delay in ms (default: 4000)
 * @returns {Promise<string>} The notification ID
 */
export const showInfo = (message, title, autoClose) =>
  showTypedNotification('info', message, title, autoClose);

/**
 * Display a warning notification with a warning icon
 * @param {string} message - The notification message
 * @param {string} title - The notification title (default: 'Warning')
 * @param {number} autoClose - Auto close delay in ms (default: 5000)
 * @returns {Promise<string>} The notification ID
 */
export const showWarning = (message, title, autoClose) =>
  showTypedNotification('warning', message, title, autoClose);

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
