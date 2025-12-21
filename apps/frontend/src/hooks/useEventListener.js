import { useEffect, useEffectEvent } from 'react';

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

  useEffect(() => {
    const targetElement = element?.current || element;
    if (!(targetElement && targetElement.addEventListener)) {
      return;
    }

    // React Compiler will stabilize this options object
    const listenerOptions = {
      passive: options.passive,
      once: options.once,
      capture: options.capture,
    };

    targetElement.addEventListener(eventName, stableHandler, listenerOptions);

    return () => {
      targetElement.removeEventListener(
        eventName,
        stableHandler,
        listenerOptions,
      );
    };
  }, [eventName, element, options.passive, options.once, options.capture]);
}
