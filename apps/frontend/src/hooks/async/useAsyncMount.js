import { useEffect, useEffectEvent } from 'react';
import { useAsyncOperation } from './useAsyncOperation';

/**
 * useAsyncMountOnce - Execute an async operation once on component mount
 *
 * Use this hook when you need to run an async operation exactly once when
 * the component mounts. For operations that should re-run when dependencies
 * change, use useAsyncEffect instead.
 *
 * @param {Function} asyncFn - Async function to execute on mount
 * @param {Object} options - Configuration options
 * @param {Function} options.onSuccess - Called when operation succeeds
 * @param {Function} options.onError - Called when operation fails
 * @param {Function} options.onCleanup - Called when component unmounts
 * @param {*} options.initialData - Initial data value
 * @param {boolean} options.resetOnExecute - Reset error/data before execution (default: true)
 *
 * @returns {Object} The useAsyncOperation state and methods
 *
 * @example
 * const operation = useAsyncMountOnce(async () => {
 *   const response = await api.getData();
 *   return response;
 * });
 *
 * if (operation.loading) return <LoadingSpinner />;
 * if (operation.error) return <ErrorMessage error={operation.error} />;
 */
export function useAsyncMountOnce(asyncFn, options = {}) {
  const { onCleanup, ...asyncOptions } = options;
  const operation = useAsyncOperation(asyncOptions);

  // Wrap callbacks with useEffectEvent for stable references
  const stableAsyncFn = useEffectEvent(asyncFn);
  const stableCleanup = useEffectEvent(() => {
    if (onCleanup) onCleanup();
  });
  const stableExecute = useEffectEvent((fn) => operation.execute(fn));

  useEffect(() => {
    stableExecute(stableAsyncFn);
    return stableCleanup;
  }, []); // Empty deps - mount only, ESLint verified

  return operation;
}

/**
 * useAsyncEffect - Execute an async operation when dependencies change
 *
 * Use this hook when you need to run an async operation that should re-execute
 * when specific dependencies change. For mount-only operations, use
 * useAsyncMountOnce instead.
 *
 * @param {Function} asyncFn - Async function to execute
 * @param {Array} deps - Dependency array that triggers re-execution
 * @param {Object} options - Configuration options
 * @param {Function} options.onSuccess - Called when operation succeeds
 * @param {Function} options.onError - Called when operation fails
 * @param {Function} options.onCleanup - Called on cleanup (unmount or before re-run)
 * @param {*} options.initialData - Initial data value
 * @param {boolean} options.resetOnExecute - Reset error/data before execution (default: true)
 *
 * @returns {Object} The useAsyncOperation state and methods
 *
 * @example
 * const operation = useAsyncEffect(
 *   async () => {
 *     const response = await api.getData(userId);
 *     return response;
 *   },
 *   [userId]
 * );
 *
 * @example
 * // With cleanup
 * const operation = useAsyncEffect(
 *   async () => {
 *     const response = await api.getData(userId);
 *     return response;
 *   },
 *   [userId],
 *   { onCleanup: () => cache.clear() }
 * );
 */
export function useAsyncEffect(asyncFn, deps, options = {}) {
  const { onCleanup, ...asyncOptions } = options;
  const operation = useAsyncOperation(asyncOptions);

  // Wrap all callbacks with useEffectEvent for stable references
  // This allows deps to be passed directly without needing execute in the array
  const stableAsyncFn = useEffectEvent(asyncFn);
  const stableCleanup = useEffectEvent(() => {
    if (onCleanup) onCleanup();
  });
  const stableExecute = useEffectEvent((fn) => operation.execute(fn));

  useEffect(() => {
    stableExecute(stableAsyncFn);
    return stableCleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is user-provided, ESLint cannot statically verify dynamic arrays
  }, deps);

  return operation;
}

// Default export for backwards compatibility
export default useAsyncMountOnce;
