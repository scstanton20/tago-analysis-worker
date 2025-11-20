import { useEffect } from 'react';
import { useAsyncOperation } from './useAsyncOperation';

/**
 * useAsyncMount - Execute an async operation on component mount
 *
 * Encapsulates the pattern of using useEffect with empty dependency array
 * to execute an async operation when a component mounts. This hook handles
 * the boilerplate of managing the effect lifecycle and async operation state.
 *
 * @param {Function} asyncFn - Async function to execute on mount
 * @param {Object} options - Configuration options
 * @param {Array} options.deps - Dependency array for useEffect (default: [])
 * @param {Function} options.onSuccess - Called when operation succeeds
 * @param {Function} options.onError - Called when operation fails
 * @param {*} options.initialData - Initial data value
 * @param {boolean} options.resetOnExecute - Reset error/data before execution (default: true)
 *
 * @returns {Object} The useAsyncOperation state and methods (loading, error, data, execute, reset, setError, setData)
 *
 * @example
 * // Basic usage - load data on mount
 * const operation = useAsyncMount(async () => {
 *   const response = await api.getData();
 *   setData(response);
 *   return response;
 * });
 *
 * if (operation.loading) return <LoadingSpinner />;
 * if (operation.error) return <ErrorMessage error={operation.error} />;
 *
 * @example
 * // With custom dependencies
 * const operation = useAsyncMount(
 *   async () => {
 *     const response = await api.getData(userId);
 *     setData(response);
 *   },
 *   { deps: [userId] }
 * );
 *
 * @example
 * // With callbacks
 * const operation = useAsyncMount(
 *   async () => {
 *     const response = await api.getData();
 *     setData(response);
 *     return response;
 *   },
 *   {
 *     onSuccess: (data) => notificationAPI.success('Data loaded'),
 *     onError: (error) => console.error('Failed to load:', error)
 *   }
 * );
 */
export function useAsyncMount(asyncFn, options = {}) {
  const { deps = [], ...asyncOptions } = options;
  const operation = useAsyncOperation(asyncOptions);

  useEffect(() => {
    operation.execute(asyncFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return operation;
}

export default useAsyncMount;
