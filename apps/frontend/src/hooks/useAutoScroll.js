/**
 * Custom hook for managing auto-scroll behavior in scrollable containers
 * For "newest at top" log displays - keeps user at top for live updates,
 * preserves scroll position when viewing history
 * @module hooks/useAutoScroll
 */

import { useRef, useState, useLayoutEffect, useCallback } from 'react';

/**
 * Hook for managing auto-scroll behavior with "newest at top" display
 * @param {Object} params - Hook parameters
 * @param {React.RefObject} params.scrollRef - Ref to the scrollable container element
 * @param {number} params.topItemCount - Count of items at TOP (SSE logs) - changes trigger scroll preservation
 * @param {number} [params.scrollAwayThreshold=100] - Pixels from top to consider "scrolled away"
 * @returns {Object} Scroll management utilities
 */
export function useAutoScroll({
  scrollRef,
  topItemCount,
  scrollAwayThreshold = 100,
}) {
  const [isScrolledAway, setIsScrolledAway] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const prevTopItemCountRef = useRef(topItemCount);
  const prevScrollHeightRef = useRef(0);

  /**
   * Preserve scroll position when new items are added at TOP only
   * If user is viewing history (scrolled down), maintain their position
   * by adjusting scrollTop by the delta in content height
   *
   * Only triggers when topItemCount changes (SSE logs), NOT when
   * bottom content changes (pagination)
   */
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const topItemsAdded = topItemCount > prevTopItemCountRef.current;
    const prevScrollHeight = prevScrollHeightRef.current;
    const currentScrollHeight = element.scrollHeight;

    // Only preserve position if:
    // 1. Items were added at TOP (not pagination at bottom)
    // 2. User is NOT at top (viewing history)
    // 3. We have a previous scroll height to compare
    if (topItemsAdded && !isAtTop && prevScrollHeight > 0) {
      const heightDelta = currentScrollHeight - prevScrollHeight;
      if (heightDelta > 0) {
        // Adjust scroll position to compensate for new content at top
        // eslint-disable-next-line react-compiler/react-compiler -- DOM ref mutation is safe
        element.scrollTop += heightDelta;
      }
    }

    // Update refs for next comparison
    prevTopItemCountRef.current = topItemCount;
    prevScrollHeightRef.current = currentScrollHeight;
  }, [topItemCount, scrollRef, isAtTop]);

  /**
   * Handle scroll position changes to detect user position
   * Tracks if user has scrolled away from top (for scroll-to-top button)
   */
  const handleScrollPositionChange = useCallback(
    (position) => {
      if (!scrollRef.current) return;

      const { scrollTop } = scrollRef.current;

      // Support both direct call and Mantine's onScrollPositionChange ({ x, y })
      const y = position?.y ?? scrollTop;

      // Track if user is at/near top (within threshold)
      const atTop = y <= scrollAwayThreshold;
      setIsAtTop(atTop);

      // Track if scrolled away (for showing scroll-to-top button)
      setIsScrolledAway(y > scrollAwayThreshold);
    },
    [scrollRef, scrollAwayThreshold],
  );

  /**
   * Scroll to top with smooth animation
   * Takes user back to live logs
   */
  const scrollToTop = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [scrollRef]);

  /**
   * Force scroll to top immediately (no animation)
   * Useful when analysis restarts
   */
  const jumpToTop = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setIsAtTop(true);
      setIsScrolledAway(false);
    }
  }, [scrollRef]);

  return {
    handleScrollPositionChange,
    isScrolledAway,
    isAtTop,
    scrollToTop,
    jumpToTop,
  };
}
