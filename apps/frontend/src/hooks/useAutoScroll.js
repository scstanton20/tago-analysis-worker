/**
 * Custom hook for managing auto-scroll behavior in scrollable containers
 * Automatically scrolls to bottom when new items are added, but respects user scroll position
 * @module hooks/useAutoScroll
 */

import { useRef, useEffect, useCallback } from 'react';

/**
 * Hook for managing auto-scroll behavior
 * @param {Object} params - Hook parameters
 * @param {React.RefObject} params.scrollRef - Ref to the scrollable container element
 * @param {Array} params.items - Array of items to watch for changes (triggers auto-scroll)
 * @param {boolean} params.hasLoadedInitial - Flag indicating if initial data has loaded
 * @param {React.RefObject} params.isMountedRef - Ref tracking if component is mounted
 * @returns {Object} Scroll management utilities
 */
export function useAutoScroll({
  scrollRef,
  items,
  hasLoadedInitial,
  isMountedRef,
}) {
  const shouldAutoScroll = useRef(false);
  const lastScrollTop = useRef(0);

  /**
   * Auto-scroll to bottom when new items arrive
   * Only triggers for live updates after initial load
   */
  useEffect(() => {
    if (
      shouldAutoScroll.current &&
      scrollRef.current &&
      items.length > 0 &&
      hasLoadedInitial &&
      isMountedRef.current
    ) {
      const element = scrollRef.current;
      // Use requestAnimationFrame for better performance
      requestAnimationFrame(() => {
        if (element && isMountedRef.current) {
          element.scrollTop = element.scrollHeight;
        }
      });
    }
  }, [items, scrollRef, hasLoadedInitial, isMountedRef]);

  /**
   * Handle scroll position changes to detect user intent
   * Disables auto-scroll when user scrolls up, re-enables when scrolling to bottom
   */
  const handleScrollPositionChange = useCallback(() => {
    if (!scrollRef.current || !isMountedRef.current) return;

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
  }, [scrollRef, isMountedRef]);

  /**
   * Enable auto-scroll (useful for resetting state)
   */
  const enableAutoScroll = useCallback(() => {
    shouldAutoScroll.current = true;
  }, []);

  /**
   * Disable auto-scroll (useful for resetting state)
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
