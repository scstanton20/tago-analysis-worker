import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';

const DEFAULT_IDLE_TIME = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 2 * 60 * 1000; // 2 minutes warning

export function useIdleTimeout(idleTime = DEFAULT_IDLE_TIME) {
  const { logout, isAuthenticated } = useAuth();
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    if (!isAuthenticated) return;

    lastActivityRef.current = Date.now();

    // Clear existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    // Set warning timeout
    warningTimeoutRef.current = setTimeout(() => {
      const shouldLogout = confirm(
        'Your session will expire in 2 minutes due to inactivity. Click OK to stay logged in or Cancel to logout now.',
      );

      if (!shouldLogout) {
        logout();
      }
    }, idleTime - WARNING_TIME);

    // Set logout timeout
    timeoutRef.current = setTimeout(() => {
      console.log('Session expired due to inactivity');
      logout();
    }, idleTime);
  }, [idleTime, logout, isAuthenticated]);

  const handleActivity = useCallback(() => {
    // Only reset if enough time has passed to avoid excessive timer resets
    const now = Date.now();
    if (now - lastActivityRef.current > 10000) {
      // 10 seconds throttle
      resetTimer();
    }
  }, [resetTimer]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear timeouts when not authenticated
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      return;
    }

    // Activity events to monitor
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    // Set initial timer
    resetTimer();

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, true);
    });

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }

      events.forEach((event) => {
        document.removeEventListener(event, handleActivity, true);
      });
    };
  }, [isAuthenticated, handleActivity, resetTimer]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated) {
        // Page became visible, reset timer
        resetTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, resetTimer]);
}
