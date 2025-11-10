// frontend/src/modals/utils/modalConfig.js

/**
 * Modal Configuration Utilities
 *
 * Provides shared configuration and helper functions for modal components.
 */

/**
 * Default modal configurations by size
 */
export const modalSizes = {
  small: 'md',
  medium: 'lg',
  large: 'xl',
  fullWidth: '90%',
};

/**
 * Default overlay configuration
 */
export const defaultOverlayProps = {
  backgroundOpacity: 0.55,
  blur: 3,
};

/**
 * Z-index configuration
 * Base z-index for modals. Mantine will automatically increment for stacked modals.
 */
export const modalZIndex = {
  base: 1000,
  overlay: 9999, // For loading overlays that should appear above modals
};

/**
 * Common modal configurations by type
 */
export const modalConfigs = {
  // Simple form modals
  form: {
    size: modalSizes.small,
    zIndex: modalZIndex.base,
    closeOnClickOutside: true,
    closeOnEscape: true,
  },

  // Editor modals (CodeMirror, etc.)
  editor: {
    size: modalSizes.fullWidth,
    zIndex: modalZIndex.base,
    closeOnClickOutside: false,
    closeOnEscape: false, // Will be controlled by hasChanges
    overlayProps: defaultOverlayProps,
  },

  // Management modals (user management, team management, etc.)
  management: {
    size: modalSizes.large,
    zIndex: modalZIndex.base,
    closeOnClickOutside: false,
    closeOnEscape: true,
  },

  // Settings/configuration modals
  settings: {
    size: modalSizes.large,
    zIndex: modalZIndex.base,
    closeOnClickOutside: false,
    closeOnEscape: true,
  },

  // View-only modals
  viewer: {
    size: modalSizes.large,
    zIndex: modalZIndex.base,
    closeOnClickOutside: true,
    closeOnEscape: true,
  },
};

/**
 * Helper to merge custom config with defaults
 * @param {string} type - Modal type (form, editor, management, settings, viewer)
 * @param {Object} customConfig - Custom configuration overrides
 * @returns {Object} Merged configuration
 */
export const getModalConfig = (type, customConfig = {}) => {
  const baseConfig = modalConfigs[type] || modalConfigs.form;
  return {
    ...baseConfig,
    ...customConfig,
  };
};

/**
 * Helper to generate unique modal IDs
 * @param {string} prefix - Modal prefix (e.g., 'analysis-editor')
 * @param {string|number} identifier - Unique identifier (e.g., analysis name, user id)
 * @returns {string} Unique modal ID
 */
export const generateModalId = (prefix, identifier = '') => {
  const timestamp = Date.now();
  return identifier
    ? `${prefix}-${identifier}-${timestamp}`
    : `${prefix}-${timestamp}`;
};

/**
 * Helper to handle modal close with unsaved changes confirmation
 * @param {Object} context - Mantine modal context
 * @param {string} id - Modal ID
 * @param {boolean} hasChanges - Whether there are unsaved changes
 * @param {Function} onClose - Optional callback after close
 */
export const handleModalClose = (context, id, hasChanges, onClose) => {
  if (hasChanges) {
    // Could integrate with Mantine's openConfirmModal here
    const confirmed = window.confirm(
      'You have unsaved changes. Are you sure you want to close?',
    );
    if (confirmed) {
      context.closeModal(id);
      onClose?.();
    }
  } else {
    context.closeModal(id);
    onClose?.();
  }
};

/**
 * Common event handler to prevent click-through
 * Use this on modal content to prevent events from propagating to overlay
 */
export const stopPropagation = (e) => {
  e.stopPropagation();
};
