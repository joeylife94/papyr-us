/**
 * Mobile-optimized Bottom Sheet Component
 * 
 * A touch-friendly bottom sheet for mobile interfaces
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useSwipe, useSafeAreaInsets } from '@/hooks/use-responsive';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  snapPoints?: number[]; // Percentages of screen height
  initialSnap?: number;
  className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  snapPoints = [50, 90],
  initialSnap = 0,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [currentSnap, setCurrentSnap] = React.useState(initialSnap);
  const [dragOffset, setDragOffset] = React.useState(0);
  const insets = useSafeAreaInsets();

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setCurrentSnap(initialSnap);
      setDragOffset(0);
    }
  }, [isOpen, initialSnap]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Drag handling
  const dragStartY = useRef<number | null>(null);
  const currentHeight = snapPoints[currentSnap];

  const handleDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (dragStartY.current === null) return;
    const delta = dragStartY.current - clientY;
    setDragOffset(delta);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragStartY.current === null) return;

    const threshold = 50; // pixels
    
    if (dragOffset > threshold && currentSnap < snapPoints.length - 1) {
      // Dragged up - expand
      setCurrentSnap(currentSnap + 1);
    } else if (dragOffset < -threshold) {
      if (currentSnap > 0) {
        // Dragged down - shrink
        setCurrentSnap(currentSnap - 1);
      } else {
        // Dragged down from minimum - close
        onClose();
      }
    }

    dragStartY.current = null;
    setDragOffset(0);
  }, [dragOffset, currentSnap, snapPoints.length, onClose]);

  // Touch handlers for the handle area
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Mouse handlers for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientY);
    
    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientY);
    };
    
    const handleMouseUp = () => {
      handleDragEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!isOpen) return null;

  const heightWithDrag = Math.min(100, Math.max(20, currentHeight + (dragOffset / window.innerHeight) * 100));

  const sheet = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300"
        onClick={onClose}
        style={{ opacity: isOpen ? 1 : 0 }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl',
          'transition-[height] duration-300 ease-out',
          'flex flex-col',
          className
        )}
        style={{
          height: `${heightWithDrag}vh`,
          paddingBottom: insets.bottom,
        }}
      >
        {/* Drag Handle */}
        <div
          className="flex-shrink-0 py-3 px-4 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto" />
          {title && (
            <h2 className="text-lg font-semibold text-center mt-2">{title}</h2>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>
      </div>
    </>
  );

  // Portal to body
  return typeof document !== 'undefined' 
    ? createPortal(sheet, document.body) 
    : null;
}

/**
 * Mobile Action Sheet - simplified bottom sheet for actions
 */
interface ActionSheetAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetAction[];
  cancelLabel?: string;
}

export function ActionSheet({
  isOpen,
  onClose,
  title,
  actions,
  cancelLabel = 'Cancel',
}: ActionSheetProps) {
  const insets = useSafeAreaInsets();

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sheet = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 px-2 animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        {/* Actions Card */}
        <div className="bg-background rounded-2xl overflow-hidden mb-2">
          {title && (
            <div className="px-4 py-3 text-center border-b">
              <span className="text-sm text-muted-foreground">{title}</span>
            </div>
          )}
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => {
                action.onClick();
                onClose();
              }}
              disabled={action.disabled}
              className={cn(
                'w-full px-4 py-3 text-center text-lg transition-colors',
                'active:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
                index > 0 && 'border-t',
                action.destructive ? 'text-destructive' : 'text-foreground'
              )}
            >
              <span className="flex items-center justify-center gap-2">
                {action.icon}
                {action.label}
              </span>
            </button>
          ))}
        </div>

        {/* Cancel Button */}
        <button
          onClick={onClose}
          className="w-full bg-background rounded-2xl px-4 py-3 text-center text-lg font-semibold text-primary active:bg-muted"
        >
          {cancelLabel}
        </button>
      </div>
    </>
  );

  return typeof document !== 'undefined'
    ? createPortal(sheet, document.body)
    : null;
}

export default BottomSheet;
