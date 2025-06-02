import { useState, useEffect } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    // Initial check on mount
    return detectMobileUserAgent();
  });

  function detectMobileUserAgent() {
    if (typeof window === 'undefined') return false;

    const userAgent = navigator.userAgent || window.opera;

    // Check for mobile user agents
    const mobileRegex =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;

    // Additional check for tablet-specific patterns
    const tabletRegex = /iPad|Android(?!.*Mobile)/i;

    // Check if it's a mobile device (excluding tablets if you want to treat them as desktop)
    const isMobileDevice = mobileRegex.test(userAgent);
    const isTablet = tabletRegex.test(userAgent);

    return isMobileDevice && !isTablet;
  }

  useEffect(() => {
    // Re-check on user agent changes (rare, but can happen with extensions)
    const checkUserAgent = () => {
      setIsMobile(detectMobileUserAgent());
    };

    // Listen for orientation changes as a fallback indicator
    const handleOrientationChange = () => {
      // Small delay to ensure user agent has been updated if it's going to be
      setTimeout(checkUserAgent, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return isMobile;
}
