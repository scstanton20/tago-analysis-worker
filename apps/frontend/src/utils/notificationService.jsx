/**
 * Centralized notification service using Mantine notifications.
 * For React components, prefer notificationAPI from './notificationAPI'. Use this directly in SSE contexts and auth providers.
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
