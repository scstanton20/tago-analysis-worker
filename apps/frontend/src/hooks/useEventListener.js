import { useEffect, useRef, useLayoutEffect, useMemo } from 'react';

/**
 * Custom hook to handle event listeners without useEffect
 * Replaces manual addEventListener/removeEventListener patterns
 */
export function useEventListener(
  eventName,
  handler,
  element = window,
  options = {},
) {
  const savedHandler = useRef();

  // Update ref whenever handler changes
  useLayoutEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

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

    // Create event listener that calls current handler
    const eventListener = (event) => savedHandler.current(event);

    targetElement.addEventListener(eventName, eventListener, stableOptions);

    // Cleanup
    return () => {
      targetElement.removeEventListener(
        eventName,
        eventListener,
        stableOptions,
      );
    };
  }, [eventName, element, stableOptions]);
}
