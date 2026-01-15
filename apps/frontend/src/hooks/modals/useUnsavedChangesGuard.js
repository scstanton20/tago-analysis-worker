/**
 * Hook to guard against closing modals with unsaved changes
 * Uses an inline overlay approach to preserve modal state
 * @module hooks/modals/useUnsavedChangesGuard
 */
import { useState, useCallback } from 'react';

// Re-export the UnsavedChangesOverlay component for convenience
// This allows modals to import both the hook and overlay from the same location
export { UnsavedChangesOverlay } from '@/components/global';

/**
 * Creates a guard for unsaved changes that shows inline confirmation
 * This approach keeps the modal open and preserves all state
 *
 * @param {boolean} hasChanges - Whether there are unsaved changes
 * @returns {Object} Guard state and handlers
 *
 * @example
 * // Import both the hook and overlay from the same location
 * import { useUnsavedChangesGuard, UnsavedChangesOverlay } from '@/hooks/modals';
 *
 * // In your component
 * const { showConfirmation, requestClose, confirmDiscard, cancelDiscard } =
 *   useUnsavedChangesGuard(hasChanges);
 *
 * // In close button handler
 * const handleClose = () => {
 *   if (requestClose(() => modals.close(id))) {
 *     modals.close(id); // Only called if no changes
 *   }
 *   // If changes exist, confirmation overlay will show
 * };
 *
 * // Render confirmation overlay when showConfirmation is true
 * // The overlay supports custom props: title, message, confirmLabel, cancelLabel
 * {showConfirmation && (
 *   <UnsavedChangesOverlay
 *     onConfirm={confirmDiscard}
 *     onCancel={cancelDiscard}
 *     message="You have unsaved changes. Are you sure you want to discard them?"
 *   />
 * )}
 */
export function useUnsavedChangesGuard(hasChanges) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  /**
   * Request to perform an action that should be guarded
   * Returns true if action can proceed immediately (no changes)
   * Returns false if confirmation is needed (shows overlay)
   */
  const requestAction = useCallback(
    (action) => {
      if (hasChanges) {
        setPendingAction(() => action);
        setShowConfirmation(true);
        return false;
      }
      return true;
    },
    [hasChanges],
  );

  /**
   * Shorthand for close action - returns true if can close immediately
   */
  const requestClose = useCallback(
    (closeAction) => {
      return requestAction(closeAction);
    },
    [requestAction],
  );

  /**
   * User confirmed they want to discard changes
   * Executes the pending action
   */
  const confirmDiscard = () => {
    setShowConfirmation(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  /**
   * User cancelled - wants to keep editing
   */
  const cancelDiscard = () => {
    setShowConfirmation(false);
    setPendingAction(null);
  };

  return {
    showConfirmation,
    requestClose,
    requestAction,
    confirmDiscard,
    cancelDiscard,
  };
}

export default useUnsavedChangesGuard;
