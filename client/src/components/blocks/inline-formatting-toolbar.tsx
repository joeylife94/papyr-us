import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link2,
  Highlighter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InlineFormatAction {
  icon: React.ReactNode;
  label: string;
  prefix: string;
  suffix: string;
  shortcut?: string;
}

const FORMAT_ACTIONS: InlineFormatAction[] = [
  {
    icon: <Bold className="h-3.5 w-3.5" />,
    label: 'Bold',
    prefix: '**',
    suffix: '**',
    shortcut: 'Ctrl+B',
  },
  {
    icon: <Italic className="h-3.5 w-3.5" />,
    label: 'Italic',
    prefix: '*',
    suffix: '*',
    shortcut: 'Ctrl+I',
  },
  {
    icon: <Underline className="h-3.5 w-3.5" />,
    label: 'Underline',
    prefix: '<u>',
    suffix: '</u>',
    shortcut: 'Ctrl+U',
  },
  {
    icon: <Strikethrough className="h-3.5 w-3.5" />,
    label: 'Strikethrough',
    prefix: '~~',
    suffix: '~~',
  },
  {
    icon: <Code className="h-3.5 w-3.5" />,
    label: 'Code',
    prefix: '`',
    suffix: '`',
  },
  {
    icon: <Highlighter className="h-3.5 w-3.5" />,
    label: 'Highlight',
    prefix: '==',
    suffix: '==',
  },
  {
    icon: <Link2 className="h-3.5 w-3.5" />,
    label: 'Link',
    prefix: '[',
    suffix: '](url)',
  },
];

interface InlineFormattingToolbarProps {
  /**
   * The container element to monitor for text selection.
   * The toolbar will appear above the selected text within this container.
   */
  containerRef: React.RefObject<HTMLElement>;
  /**
   * Callback when formatting is applied.
   * Receives the textarea element and the prefix/suffix to wrap the selection.
   */
  onFormat?: (textarea: HTMLTextAreaElement, prefix: string, suffix: string) => void;
}

export function InlineFormattingToolbar({
  containerRef,
  onFormat,
}: InlineFormattingToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [activeTextarea, setActiveTextarea] = useState<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSelection = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find active textarea within the container
    const activeEl = document.activeElement;
    if (
      !activeEl ||
      activeEl.tagName !== 'TEXTAREA' ||
      !container.contains(activeEl)
    ) {
      return;
    }

    const textarea = activeEl as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end || end - start < 1) {
      // No selection — hide after delay
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => setVisible(false), 200);
      return;
    }

    // Cancel pending hide
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    // Calculate position relative to viewport
    const rect = textarea.getBoundingClientRect();
    // Position above the textarea, centered
    setPosition({
      top: rect.top - 44,
      left: rect.left + rect.width / 2,
    });

    setActiveTextarea(textarea);
    setVisible(true);
  }, [containerRef]);

  // Listen for selection changes (mouseup + keyup)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleSelectionChange = () => {
      requestAnimationFrame(checkSelection);
    };

    container.addEventListener('mouseup', handleSelectionChange);
    container.addEventListener('keyup', handleSelectionChange);

    return () => {
      container.removeEventListener('mouseup', handleSelectionChange);
      container.removeEventListener('keyup', handleSelectionChange);
    };
  }, [containerRef, checkSelection]);

  // Keyboard shortcuts
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const activeEl = document.activeElement;
      if (!activeEl || activeEl.tagName !== 'TEXTAREA' || !container.contains(activeEl)) return;

      const textarea = activeEl as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start === end) return;

      let action: InlineFormatAction | undefined;
      switch (e.key.toLowerCase()) {
        case 'b':
          action = FORMAT_ACTIONS.find((a) => a.label === 'Bold');
          break;
        case 'i':
          action = FORMAT_ACTIONS.find((a) => a.label === 'Italic');
          break;
        case 'u':
          action = FORMAT_ACTIONS.find((a) => a.label === 'Underline');
          break;
      }

      if (action) {
        e.preventDefault();
        applyFormat(textarea, action.prefix, action.suffix);
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef]);

  const applyFormat = (textarea: HTMLTextAreaElement, prefix: string, suffix: string) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    // Check if already formatted — toggle off
    const before = text.substring(Math.max(0, start - prefix.length), start);
    const after = text.substring(end, end + suffix.length);

    let newValue: string;
    let newStart: number;
    let newEnd: number;

    if (before === prefix && after === suffix) {
      // Remove formatting
      newValue =
        text.substring(0, start - prefix.length) +
        selectedText +
        text.substring(end + suffix.length);
      newStart = start - prefix.length;
      newEnd = end - prefix.length;
    } else {
      // Add formatting
      newValue =
        text.substring(0, start) +
        prefix +
        selectedText +
        suffix +
        text.substring(end);
      newStart = start + prefix.length;
      newEnd = end + prefix.length;
    }

    // Update textarea value
    textarea.value = newValue;
    textarea.selectionStart = newStart;
    textarea.selectionEnd = newEnd;

    // Fire input event so React picks up the change
    const nativeInputEvent = new Event('input', { bubbles: true });
    textarea.dispatchEvent(nativeInputEvent);

    // Also fire change event
    const changeEvent = new Event('change', { bubbles: true });
    textarea.dispatchEvent(changeEvent);

    // Call custom handler if provided
    if (onFormat) {
      onFormat(textarea, prefix, suffix);
    }

    textarea.focus();
  };

  if (!visible || !activeTextarea) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[9999] flex items-center gap-0.5 px-1 py-0.5 bg-slate-900 dark:bg-slate-100 rounded-lg shadow-xl"
      style={{
        top: Math.max(8, position.top),
        left: position.left,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(e) => {
        // Prevent toolbar click from stealing focus
        e.preventDefault();
      }}
    >
      {FORMAT_ACTIONS.map((action) => (
        <Button
          key={action.label}
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300 rounded-md"
          title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ''}`}
          onClick={() => {
            if (activeTextarea) {
              applyFormat(activeTextarea, action.prefix, action.suffix);
            }
          }}
        >
          {action.icon}
        </Button>
      ))}
    </div>
  );
}
