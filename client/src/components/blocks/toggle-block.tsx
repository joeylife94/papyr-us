import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToggleDisclosureProps {
  collapsed: boolean;
  onToggle: () => void;
  /** The summary line: an editable text block. */
  children: React.ReactNode;
}

/**
 * A toggle block's summary row: the disclosure triangle and the summary text. The blocks nested
 * under the toggle are separate rows of the editor, hidden while the toggle is collapsed. Whether
 * it is collapsed is the viewer's own (client/src/lib/toggle-state.ts), not part of the page.
 */
export function ToggleDisclosure({ collapsed, onToggle, children }: ToggleDisclosureProps) {
  return (
    <div className="flex items-start">
      <button
        type="button"
        data-testid="toggle-disclosure"
        aria-expanded={!collapsed}
        aria-label={collapsed ? '토글 펼치기' : '토글 접기'}
        onClick={onToggle}
        className="mt-2 flex h-6 w-6 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-90')}
        />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
