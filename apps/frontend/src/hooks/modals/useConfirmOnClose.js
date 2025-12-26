/**
 * Hook to handle modal close with unsaved changes confirmation
 * Uses Mantine's openConfirmModal for consistent UX
 * @module hooks/modals/useConfirmOnClose
 */
import { useCallback } from 'react';
import { modals } from '@mantine/modals';

/**
 * Creates a close handler that shows confirmation when there are unsaved changes
 *
 * @param {string} modalId - The modal ID to close
 * @param {boolean} hasChanges - Whether there are unsaved changes
 * @param {Object} options - Optional customization
 * @param {string} options.title - Dialog title (default: 'Unsaved Changes')
 * @param {string} options.message - Confirmation message
 * @param {string} options.confirmLabel - Confirm button label (default: 'Discard Changes')
 * @param {string} options.cancelLabel - Cancel button label (default: 'Keep Editing')
 * @param {Function} options.onDiscard - Callback before closing (for cleanup)
 * @returns {Function} handleClose function to use with CloseButton
 *
 * @example
 * const handleClose = useConfirmOnClose(id, hasChanges, {
 *   message: 'Discard unsaved code changes?',
 * });
 *
 * <CloseButton onClick={handleClose} />
 */
export function useConfirmOnClose(modalId, hasChanges, options = {}) {
  const {
    title = 'Unsaved Changes',
    message = 'You have unsaved changes. Are you sure you want to discard them?',
    confirmLabel = 'Discard Changes',
    cancelLabel = 'Keep Editing',
    onDiscard,
  } = options;

  const handleClose = useCallback(() => {
    if (hasChanges) {
      modals.openConfirmModal({
        title,
        children: message,
        labels: { confirm: confirmLabel, cancel: cancelLabel },
        confirmProps: { color: 'red' },
        centered: true,
        onConfirm: () => {
          if (onDiscard) {
            onDiscard();
          }
          modals.close(modalId);
        },
      });
    } else {
      modals.close(modalId);
    }
  }, [
    hasChanges,
    modalId,
    title,
    message,
    confirmLabel,
    cancelLabel,
    onDiscard,
  ]);

  return handleClose;
}

export default useConfirmOnClose;
