/**
 * Custom hook for managing auto-scroll behavior in scrollable containers
 * Automatically scrolls to bottom when new items are added, but respects user scroll position
 * @module hooks/useAutoScroll
 */

import { useRef, useLayoutEffect, useCallback } from 'react';

/**
 * Hook for managing auto-scroll behavior
 * @param {Object} params - Hook parameters
 * @param {React.RefObject} params.scrollRef - Ref to the scrollable container element
 * @param {Array} params.items - Array of items to watch for changes (triggers auto-scroll)
 * @param {boolean} params.hasLoadedInitial - Flag indicating if initial data has loaded
 * @returns {Object} Scroll management utilities
 */
export function useAutoScroll({ scrollRef, items, hasLoadedInitial }) {
  const shouldAutoScroll = useRef(false);
  const lastScrollTop = useRef(0);

  /**
   * Auto-scroll to bottom when new items arrive
   * Only triggers for live updates after initial load
   * Uses useLayoutEffect to prevent visual flickering by scrolling before paint
   */
  useLayoutEffect(() => {
    if (
      shouldAutoScroll.current &&
      scrollRef.current &&
      items.length > 0 &&
      hasLoadedInitial
    ) {
      const element = scrollRef.current;
      // useLayoutEffect fires before paint, so no need for requestAnimationFrame
      // eslint-disable-next-line react-compiler/react-compiler -- DOM ref mutation is safe and intended for scrolling
      element.scrollTop = element.scrollHeight;
    }
  }, [items, scrollRef, hasLoadedInitial]);

  /**
   * Handle scroll position changes to detect user intent
   * Disables auto-scroll when user scrolls up, re-enables when scrolling to bottom
   * Memoized since it only mutates refs, making it safe for effect dependencies
   */
  const handleScrollPositionChange = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Check if user scrolled up manually
    if (scrollTop < lastScrollTop.current) {
      shouldAutoScroll.current = false;
    }

    // Only re-enable auto-scroll if user scrolls to the very bottom
    if (scrollHeight - (scrollTop + clientHeight) < 10) {
      shouldAutoScroll.current = true;
    }

    lastScrollTop.current = scrollTop;
  }, [scrollRef]);

  /**
   * Enable auto-scroll (useful for resetting state)
   * Memoized since it only mutates refs, making it safe for effect dependencies
   */
  const enableAutoScroll = useCallback(() => {
    shouldAutoScroll.current = true;
  }, []);

  /**
   * Disable auto-scroll (useful for resetting state)
   * Memoized since it only mutates refs, making it safe for effect dependencies
   */
  const disableAutoScroll = useCallback(() => {
    shouldAutoScroll.current = false;
  }, []);

  return {
    handleScrollPositionChange,
    enableAutoScroll,
    disableAutoScroll,
  };
}
