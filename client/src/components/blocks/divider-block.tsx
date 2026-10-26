import React, { useEffect, useRef } from 'react';
import { Block, BlockType } from '@shared/schema';
import { cn } from '@/lib/utils';

interface DividerBlockProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onDelete: () => void;
  onAddBlock: (type?: BlockType) => void;
}

/**
 * A horizontal rule (#113 §1), `---` in the page's Markdown. It has no text, so the row itself
 * takes focus (click or Tab): Backspace or Delete removes it, Enter adds a paragraph below. The
 * drag handle and insert button stay in the editor's gutter like every other block.
 */
export function DividerBlock({
  block,
  isFocused,
  onFocus,
  onBlur,
  onDelete,
  onAddBlock,
}: DividerBlockProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused && document.activeElement !== rowRef.current) rowRef.current?.focus();
  }, [isFocused]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      onDelete();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onAddBlock('paragraph');
    }
  };

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="구분선"
      title="구분선 · Backspace 또는 Delete로 삭제"
      tabIndex={0}
      data-testid="divider-block"
      data-block-id={block.id}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        // Clicking the line selects the block, like clicking into a text block.
        event.preventDefault();
        rowRef.current?.focus();
      }}
      className={cn(
        'flex h-9 cursor-pointer items-center rounded-lg px-2 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring',
        isFocused && 'bg-primary/10'
      )}
    >
      <hr className="w-full border-0 border-t border-border" />
    </div>
  );
}
