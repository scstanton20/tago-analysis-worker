import { modals } from '@mantine/modals';
import PropTypes from 'prop-types';

/**
 * ConfirmDialog - Reusable confirmation dialog utility
 *
 * Wraps Mantine modals.openConfirmModal with consistent defaults.
 * Used for delete confirmations and other destructive actions.
 *
 */
// eslint-disable-next-line react-refresh/only-export-components
export const ConfirmDialog = {
  /**
   * Opens a generic confirmation dialog
   */
  open: ({
    title = 'Confirm Action',
    message,
    children,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    confirmColor = 'red',
    onConfirm,
    onCancel,
    loading = false,
    centered = true,
    ...props
  }) => {
    modals.openConfirmModal({
      title,
      children: children || message,
      labels: { confirm: confirmLabel, cancel: cancelLabel },
      confirmProps: { color: confirmColor, loading },
      onConfirm,
      onCancel,
      centered,
      ...props,
    });
  },

  /**
   * Opens a delete confirmation dialog with red styling
   */
  delete: ({
    title = 'Delete Item',
    message,
    itemName,
    onConfirm,
    onCancel,
    loading = false,
    ...props
  }) => {
    const defaultMessage = itemName
      ? `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
      : 'Are you sure you want to delete this item? This action cannot be undone.';

    ConfirmDialog.open({
      title,
      message: message || defaultMessage,
      confirmLabel: 'Delete',
      confirmColor: 'red',
      onConfirm,
      onCancel,
      loading,
      ...props,
    });
  },

  /**
   * Opens a warning confirmation dialog with yellow styling
   */
  warning: ({
    title = 'Warning',
    message,
    confirmLabel = 'Continue',
    onConfirm,
    onCancel,
    loading = false,
    ...props
  }) => {
    ConfirmDialog.open({
      title,
      message,
      confirmLabel,
      confirmColor: 'yellow',
      onConfirm,
      onCancel,
      loading,
      ...props,
    });
  },

  /**
   * Opens an info confirmation dialog with brand color styling
   */
  info: ({
    title = 'Confirm',
    message,
    confirmLabel = 'OK',
    onConfirm,
    onCancel,
    loading = false,
    ...props
  }) => {
    ConfirmDialog.open({
      title,
      message,
      confirmLabel,
      confirmColor: 'brand',
      onConfirm,
      onCancel,
      loading,
      ...props,
    });
  },
};

// PropTypes for better IDE support
ConfirmDialog.open.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  children: PropTypes.node,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  confirmColor: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  loading: PropTypes.bool,
  centered: PropTypes.bool,
};

ConfirmDialog.delete.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  itemName: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  loading: PropTypes.bool,
};

export default ConfirmDialog;
