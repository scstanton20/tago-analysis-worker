import { useRef, useEffect } from 'react';

/**
 * Custom hook to track if component is mounted
 * Replaces manual mounted tracking patterns
 */
export function useMountedRef() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return mountedRef;
}
