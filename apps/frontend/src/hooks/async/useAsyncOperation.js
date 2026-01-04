import { useState, useCallback } from 'react';

/**
 * useAsyncOperation - Manage async operation state
 * @param {Object} options - Configuration options
 * @param {Function} options.onSuccess - Called when operation succeeds
 * @param {Function} options.onError - Called when operation fails
 * @param {*} options.initialData - Initial data value
 * @param {boolean} options.resetOnExecute - Reset error/data before execution (default: true)
 *
 */
export function useAsyncOperation(options = {}) {
  const {
    onSuccess,
    onError,
    initialData = null,
    resetOnExecute = true,
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(initialData);

  /**
   * Execute an async operation with automatic state management
   * @param {Function} asyncFn - Async function to execute
   * @returns {Promise<*>} The result of the async operation, or null if error
   */
  const execute = useCallback(
    async (asyncFn) => {
      if (resetOnExecute) {
        setError(null);
        setData(null);
      }

      setLoading(true);

      try {
        const result = await asyncFn();
        setData(result);

        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (err) {
        const errorMessage = err.message || 'An error occurred';
        setError(errorMessage);

        if (onError) {
          onError(err);
        }

        return null;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError, resetOnExecute],
  );

  /**
   * Reset all state to initial values
   */
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(initialData);
  }, [initialData]);

  /**
   * Set error manually
   */
  const setErrorManually = (err) => {
    setError(err);
  };

  /**
   * Set data manually
   */
  const setDataManually = (newData) => {
    setData(newData);
  };

  return {
    execute,
    loading,
    error,
    data,
    reset,
    setError: setErrorManually,
    setData: setDataManually,
  };
}

export default useAsyncOperation;
