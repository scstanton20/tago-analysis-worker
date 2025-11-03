import { useEffect, useRef, useLayoutEffect } from 'react';

/**
 * Custom hook for intervals that handles cleanup automatically
 * Replaces manual setInterval/clearInterval patterns
 */
export function useInterval(callback, delay, immediate = false) {
  const savedCallback = useRef();

  // Remember the latest callback
  useLayoutEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    function tick() {
      savedCallback.current();
    }

    // Run immediately if requested
    if (immediate) {
      tick();
    }

    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay, immediate]);
}

/**
 * Hook for timeout with cleanup
 */
export function useTimeout(callback, delay) {
  const savedCallback = useRef();

  useLayoutEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setTimeout(() => savedCallback.current(), delay);
    return () => clearTimeout(id);
  }, [delay]);
}
