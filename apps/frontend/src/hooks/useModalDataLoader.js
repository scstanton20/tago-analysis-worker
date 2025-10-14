import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to handle modal data loading patterns
 * Replaces repeated modal loading/cleanup useEffect patterns
 */
export function useModalDataLoader(opened, loaders = [], condition = true) {
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(() => {
    if (Array.isArray(loaders)) {
      loaders.forEach((loader) => {
        if (typeof loader === 'function') {
          loader();
        }
      });
    } else if (typeof loaders === 'function') {
      loaders();
    }
  }, [loaders]);

  useEffect(() => {
    if (opened && condition && !hasLoaded) {
      // Load data and defer state update to avoid cascading renders
      load();
      Promise.resolve().then(() => {
        setHasLoaded(true);
      });
    } else if (!opened && hasLoaded) {
      // Reset loaded flag when modal closes (deferred to avoid cascading renders)
      Promise.resolve().then(() => {
        setHasLoaded(false);
      });
    }
  }, [opened, condition, hasLoaded, load]);

  return hasLoaded;
}
