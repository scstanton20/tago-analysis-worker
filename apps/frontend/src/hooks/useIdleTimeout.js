import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import authService from '../services/authService';

const DEFAULT_IDLE_TIME = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 2 * 60 * 1000; // 2 minutes warning
const PROACTIVE_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes when proactive refresh is active

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

    // Use longer timeout if proactive refresh is active and page is visible
    const effectiveIdleTime =
      document.visibilityState === 'visible' && authService.refreshTimer
        ? PROACTIVE_REFRESH_THRESHOLD
        : idleTime;

    // Set warning timeout
    warningTimeoutRef.current = setTimeout(async () => {
      const shouldStayLoggedIn = confirm(
        'Your session will expire in 2 minutes due to inactivity. Click OK to stay logged in or Cancel to logout now.',
      );

      if (shouldStayLoggedIn) {
        // User wants to stay logged in, proactively refresh token and reset timer
        try {
          await authService.refreshToken();
          console.log('Token refreshed after user chose to stay logged in');
          resetTimer(); // Reset the idle timer after successful refresh
        } catch (error) {
          console.error('Failed to refresh token:', error);
          // If refresh fails, logout anyway
          logout();
        }
      } else {
        logout();
      }
    }, effectiveIdleTime - WARNING_TIME);

    // Set logout timeout
    timeoutRef.current = setTimeout(() => {
      console.log('Session expired due to inactivity');
      logout();
    }, effectiveIdleTime);
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
        // Page became visible, reset timer with potentially longer timeout
        resetTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, resetTimer]);
}
