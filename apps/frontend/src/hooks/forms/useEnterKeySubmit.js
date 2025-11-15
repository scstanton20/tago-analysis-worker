import { useCallback } from 'react';

/**
 * useEnterKeySubmit - Handle Enter key press for form submission
 *
 * Found in 3+ files. Provides a consistent way to handle Enter key
 * submissions in forms and inputs.
 *
 * @example
 * // Basic usage
 * const handleEnterSubmit = useEnterKeySubmit(handleSave);
 *
 * return (
 *   <TextInput
 *     onKeyDown={handleEnterSubmit}
 *     placeholder="Enter name..."
 *   />
 * );
 *
 * @example
 * // With Shift+Enter to allow newlines
 * const handleEnterSubmit = useEnterKeySubmit(handleSave, {
 *   ignoreShift: true,
 * });
 *
 * @example
 * // Prevent default and stop propagation
 * const handleEnterSubmit = useEnterKeySubmit(handleSave, {
 *   preventDefault: true,
 *   stopPropagation: true,
 * });
 *
 * @param {Function} onSubmit - Function to call on Enter key press
 * @param {Object} options - Configuration options
 * @param {boolean} options.preventDefault - Prevent default behavior (default: true)
 * @param {boolean} options.stopPropagation - Stop event propagation (default: false)
 * @param {boolean} options.ignoreShift - Ignore Shift+Enter (default: false)
 * @param {boolean} options.ignoreCtrl - Ignore Ctrl+Enter (default: false)
 * @param {boolean} options.ignoreMeta - Ignore Meta+Enter (default: false)
 * @returns {Function} Event handler for onKeyDown/onKeyPress
 */
export function useEnterKeySubmit(onSubmit, options = {}) {
  const {
    preventDefault = true,
    stopPropagation = false,
    ignoreShift = false,
    ignoreCtrl = false,
    ignoreMeta = false,
  } = options;

  return useCallback(
    (event) => {
      if (event.key !== 'Enter') {
        return;
      }

      // Check modifier keys
      if (ignoreShift && event.shiftKey) return;
      if (ignoreCtrl && event.ctrlKey) return;
      if (ignoreMeta && event.metaKey) return;

      // Prevent default form submission if needed
      if (preventDefault) {
        event.preventDefault();
      }

      if (stopPropagation) {
        event.stopPropagation();
      }

      // Call the submit handler
      onSubmit(event);
    },
    [
      onSubmit,
      preventDefault,
      stopPropagation,
      ignoreShift,
      ignoreCtrl,
      ignoreMeta,
    ],
  );
}

export default useEnterKeySubmit;
