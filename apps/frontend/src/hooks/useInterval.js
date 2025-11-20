import { useEffect, useEffectEvent } from 'react';

/**
 * Custom hook for intervals that handles cleanup automatically
 */
export function useInterval(callback, delay, immediate = false) {
  // useEffectEvent creates a stable function that always uses latest callback
  const onTick = useEffectEvent(callback);

  useEffect(() => {
    if (delay === null) return;

    if (immediate) {
      onTick();
    }

    const id = setInterval(onTick, delay);
    return () => clearInterval(id);
  }, [delay, immediate]);
}

/**
 * Custom hook for timeouts with automatic cleanup
 * React 19: Uses useEffectEvent to access latest callback
 */
export function useTimeout(callback, delay) {
  const onTimeout = useEffectEvent(callback);

  useEffect(() => {
    if (delay === null) return;

    const id = setTimeout(onTimeout, delay);
    return () => clearTimeout(id);
  }, [delay]);
}
