import { useEffect, useEffectEvent, useMemo } from 'react';

/**
 * Custom hook to handle event listeners
 */
export function useEventListener(
  eventName,
  handler,
  element = window,
  options = {},
) {
  // useEffectEvent ensures we always call the latest handler
  const stableHandler = useEffectEvent(handler);

  // Create stable reference to options object to prevent unnecessary effect re-runs
  const stableOptions = useMemo(
    () => ({
      passive: options.passive,
      once: options.once,
      capture: options.capture,
    }),
    [options.passive, options.once, options.capture],
  );

  useEffect(() => {
    const targetElement = element?.current || element;
    if (!(targetElement && targetElement.addEventListener)) {
      return;
    }

    // Now we can use stableHandler directly
    targetElement.addEventListener(eventName, stableHandler, stableOptions);

    // Cleanup
    return () => {
      targetElement.removeEventListener(
        eventName,
        stableHandler,
        stableOptions,
      );
    };
  }, [eventName, element, stableOptions]);
}
