/**
 * Hook for managing resizable container height via drag
 * Handles mouse events, cleanup, and constrains height within bounds
 *
 * @module hooks/useResizableHeight
 */

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Manages resizable height with drag-to-resize functionality
 *
 * @param {Object} params - Hook parameters
 * @param {number} [params.initialHeight=384] - Initial height in pixels
 * @param {number} [params.minHeight=96] - Minimum allowed height
 * @param {number} [params.maxHeight=800] - Maximum allowed height
 * @returns {Object} Resize state and handlers
 */
export function useResizableHeight({
  initialHeight = 384,
  minHeight = 96,
  maxHeight = 800,
} = {}) {
  const [height, setHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);

  // Store active event listeners to ensure cleanup on unmount
  const activeListenersRef = useRef({ onMouseMove: null, onMouseUp: null });

  // Cleanup effect to remove event listeners on unmount
  useEffect(() => {
    return () => {
      const { onMouseMove, onMouseUp } = activeListenersRef.current;
      if (onMouseMove) {
        document.removeEventListener('mousemove', onMouseMove);
      }
      if (onMouseUp) {
        document.removeEventListener('mouseup', onMouseUp);
      }
    };
  }, []);

  // Handle mouse down to start resize
  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = height;
      setIsResizing(true);

      function onMouseMove(moveEvent) {
        const delta = moveEvent.clientY - startY;
        const newHeight = Math.max(
          minHeight,
          Math.min(maxHeight, startHeight + delta),
        );
        setHeight(newHeight);
      }

      function onMouseUp() {
        setIsResizing(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        activeListenersRef.current = { onMouseMove: null, onMouseUp: null };
      }

      activeListenersRef.current = { onMouseMove, onMouseUp };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [height, minHeight, maxHeight],
  );

  return {
    height,
    isResizing,
    handleResizeStart,
  };
}
