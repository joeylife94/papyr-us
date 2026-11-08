import React, { useEffect, useRef } from 'react';
import { Block, BlockType } from '@shared/schema';
import { cn } from '@/lib/utils';
import { PageEmbed } from '@/components/page/page-embed';

interface PageEmbedBlockProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onDelete: () => void;
  onAddBlock: (type?: BlockType) => void;
}

/** The target page id stored in a `page_embed` block, or NaN (rendered as inaccessible). */
export function embedBlockPageId(block: Pick<Block, 'properties'>): number {
  const value = block.properties?.pageId;
  if (typeof value === 'number') return value;
  return typeof value === 'string' && /^\d{1,10}$/.test(value) ? Number(value) : Number.NaN;
}

/**
 * A page embed in the editor (#135): the target page, read-only and live, as readers see it
 * (`PageEmbed`). The block stores only the target's id. Like a divider, the row itself takes
 * focus (click or Tab): Backspace or Delete removes the embed, Enter adds a paragraph below.
 */
export function PageEmbedBlock({
  block,
  isFocused,
  onFocus,
  onBlur,
  onDelete,
  onAddBlock,
}: PageEmbedBlockProps) {
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
      aria-label="페이지 임베드"
      title="페이지 임베드 · Backspace 또는 Delete로 삭제"
      tabIndex={0}
      data-testid="page-embed-block"
      data-block-id={block.id}
      onFocus={(event) => event.target === event.currentTarget && onFocus()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur();
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-lg px-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        isFocused && 'bg-primary/10'
      )}
    >
      <PageEmbed pageId={embedBlockPageId(block)} />
    </div>
  );
}
