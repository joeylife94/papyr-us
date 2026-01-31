/**
 * Mobile-first responsive hook for React
 * 
 * Provides responsive utilities and breakpoint detection
 */

import { useState, useEffect, useCallback } from 'react';

// Tailwind-compatible breakpoints
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/**
 * Check if we're on the server (SSR)
 */
const isServer = typeof window === 'undefined';

/**
 * Get current viewport width
 */
function getViewportWidth(): number {
  if (isServer) return 0;
  return window.innerWidth;
}

/**
 * Hook to detect current breakpoint
 */
export function useBreakpoint(): {
  breakpoint: Breakpoint | 'xs';
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
} {
  const [width, setWidth] = useState(getViewportWidth);

  useEffect(() => {
    if (isServer) return;

    const handleResize = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const breakpoint: Breakpoint | 'xs' = 
    width >= breakpoints['2xl'] ? '2xl' :
    width >= breakpoints.xl ? 'xl' :
    width >= breakpoints.lg ? 'lg' :
    width >= breakpoints.md ? 'md' :
    width >= breakpoints.sm ? 'sm' : 'xs';

  return {
    breakpoint,
    width,
    isMobile: width < breakpoints.md,
    isTablet: width >= breakpoints.md && width < breakpoints.lg,
    isDesktop: width >= breakpoints.lg,
  };
}

/**
 * Hook to detect if viewport is at or above a breakpoint
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (isServer) return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Hook to check if viewport is at minimum breakpoint
 */
export function useMinBreakpoint(bp: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${breakpoints[bp]}px)`);
}

/**
 * Hook to check if viewport is at maximum breakpoint
 */
export function useMaxBreakpoint(bp: Breakpoint): boolean {
  return useMediaQuery(`(max-width: ${breakpoints[bp] - 1}px)`);
}

/**
 * Hook for mobile-optimized navigation state
 */
export function useMobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const { isMobile } = useBreakpoint();

  // Close mobile nav when resizing to desktop
  useEffect(() => {
    if (!isMobile && isOpen) {
      setIsOpen(false);
    }
  }, [isMobile, isOpen]);

  // Prevent body scroll when mobile nav is open
  useEffect(() => {
    if (isServer) return;

    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isMobile]);

  const toggle = useCallback(() => setIsOpen(prev => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return {
    isOpen,
    toggle,
    open,
    close,
    isMobile,
  };
}

/**
 * Hook for touch-friendly interactions
 */
export function useTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (isServer) return;

    const checkTouch = () => {
      setIsTouch(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (navigator as any).msMaxTouchPoints > 0
      );
    };

    checkTouch();
    window.addEventListener('touchstart', () => setIsTouch(true), { once: true });
  }, []);

  return isTouch;
}

/**
 * Hook for swipe gestures
 */
export function useSwipe(
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  threshold = 50
) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > threshold;
    const isRightSwipe = distance < -threshold;

    if (isLeftSwipe && onSwipeLeft) {
      onSwipeLeft();
    }
    if (isRightSwipe && onSwipeRight) {
      onSwipeRight();
    }
  }, [touchStart, touchEnd, threshold, onSwipeLeft, onSwipeRight]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

/**
 * Hook for safe area insets (notched phones)
 */
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    if (isServer) return;

    const computeInsets = () => {
      const style = getComputedStyle(document.documentElement);
      setInsets({
        top: parseInt(style.getPropertyValue('--sat') || '0') || 0,
        right: parseInt(style.getPropertyValue('--sar') || '0') || 0,
        bottom: parseInt(style.getPropertyValue('--sab') || '0') || 0,
        left: parseInt(style.getPropertyValue('--sal') || '0') || 0,
      });
    };

    // Set CSS variables for safe area
    document.documentElement.style.setProperty('--sat', 'env(safe-area-inset-top)');
    document.documentElement.style.setProperty('--sar', 'env(safe-area-inset-right)');
    document.documentElement.style.setProperty('--sab', 'env(safe-area-inset-bottom)');
    document.documentElement.style.setProperty('--sal', 'env(safe-area-inset-left)');

    computeInsets();
    window.addEventListener('resize', computeInsets);
    window.addEventListener('orientationchange', computeInsets);

    return () => {
      window.removeEventListener('resize', computeInsets);
      window.removeEventListener('orientationchange', computeInsets);
    };
  }, []);

  return insets;
}

/**
 * Hook for orientation detection
 */
export function useOrientation(): 'portrait' | 'landscape' {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    if (isServer) return;

    const updateOrientation = () => {
      if (window.screen?.orientation) {
        setOrientation(
          window.screen.orientation.type.includes('portrait') ? 'portrait' : 'landscape'
        );
      } else {
        setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
      }
    };

    updateOrientation();
    window.addEventListener('orientationchange', updateOrientation);
    window.addEventListener('resize', updateOrientation);

    return () => {
      window.removeEventListener('orientationchange', updateOrientation);
      window.removeEventListener('resize', updateOrientation);
    };
  }, []);

  return orientation;
}

/**
 * Hook for virtual keyboard detection (mobile)
 */
export function useVirtualKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (isServer) return;

    // Use Visual Viewport API if available
    if ('visualViewport' in window && window.visualViewport) {
      const viewport = window.visualViewport;

      const handleResize = () => {
        const heightDiff = window.innerHeight - viewport.height;
        setIsKeyboardOpen(heightDiff > 150); // Threshold for keyboard
        setKeyboardHeight(heightDiff > 150 ? heightDiff : 0);
      };

      viewport.addEventListener('resize', handleResize);
      return () => viewport.removeEventListener('resize', handleResize);
    }

    // Fallback for older browsers
    const initialHeight = window.innerHeight;
    
    const handleResize = () => {
      const heightDiff = initialHeight - window.innerHeight;
      setIsKeyboardOpen(heightDiff > 150);
      setKeyboardHeight(heightDiff > 150 ? heightDiff : 0);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { isKeyboardOpen, keyboardHeight };
}

export default {
  useBreakpoint,
  useMediaQuery,
  useMinBreakpoint,
  useMaxBreakpoint,
  useMobileNav,
  useTouchDevice,
  useSwipe,
  useSafeAreaInsets,
  useOrientation,
  useVirtualKeyboard,
  breakpoints,
};
