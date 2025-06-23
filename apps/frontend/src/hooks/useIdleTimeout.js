import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import authService from '../services/authService';

const DEFAULT_IDLE_TIME = 15 * 60 * 1000; // 15 minutes - consistent timeout
const WARNING_TIME = 2 * 60 * 1000; // 2 minutes warning
const ACTIVITY_THROTTLE = 5 * 1000; // 5 seconds throttle (reduced from 10)

export function useIdleTimeout(idleTime = DEFAULT_IDLE_TIME) {
  const { logout, isAuthenticated } = useAuth();
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const isWarningActiveRef = useRef(false);

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

    // Reset warning state
    isWarningActiveRef.current = false;

    // Always use consistent idle time (removed variable timeout logic)
    const effectiveIdleTime = idleTime;

    // Set warning timeout
    warningTimeoutRef.current = setTimeout(async () => {
      // Prevent multiple warning dialogs
      if (isWarningActiveRef.current) return;
      isWarningActiveRef.current = true;

      const shouldStayLoggedIn = confirm(
        'Your session will expire in 2 minutes due to inactivity. Click OK to stay logged in or Cancel to logout now.',
      );

      if (shouldStayLoggedIn) {
        // User wants to stay logged in, refresh token and reset timer
        try {
          await authService.refreshToken();
          resetTimer(); // Reset the idle timer after successful refresh
        } catch (error) {
          console.error('Failed to refresh token during idle warning:', error);
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
    // Skip if warning is active to prevent interference
    if (isWarningActiveRef.current) return;

    // Only reset if enough time has passed to avoid excessive timer resets
    const now = Date.now();
    if (now - lastActivityRef.current > ACTIVITY_THROTTLE) {
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

  // Handle page visibility changes - coordinate with authService
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated && !isWarningActiveRef.current) {
        // Page became visible and no warning active, reset timer
        // Note: authService handles token refresh on visibility change
        resetTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, resetTimer]);
}
