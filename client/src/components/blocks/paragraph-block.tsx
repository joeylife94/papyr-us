import React, { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@shared/schema';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageLinkChip } from '@/components/page/page-links';
import { useInlinePreview } from '@/components/page/inline-preview';
import { extractPageLinkIds, hasPageLinks } from '@shared/page-links';

interface ParagraphBlockProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onAddBlock: (type?: BlockType) => void;
  onSlashCommand?: (rect: DOMRect) => void;
  onSlashFilter?: (filter: string) => void;
  onSlashClose?: () => void;
  /** `@` or `[[` was typed (issue #103 E6): open the link picker for that span of text. */
  onPageLinkTrigger?: (rect: DOMRect, start: number, length: number) => void;
  /** Markdown shortcuts (#111 §6): returns true when the editor converted the block. */
  onMarkdownShortcut?: (previous: string, next: string, caret: number) => boolean;
  placeholder?: string;
}

/** Focus or clicks on a link chip open the linked page instead of editing the block. */
const isOnPageLink = (target: EventTarget) =>
  target instanceof Element && !!target.closest('a[data-page-link-state]');

export function ParagraphBlock({
  block,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
  onAddBlock,
  onSlashCommand,
  onSlashFilter,
  onSlashClose,
  onPageLinkTrigger,
  onMarkdownShortcut,
  placeholder = '단락을 입력하세요...',
}: ParagraphBlockProps) {
  const [content, setContent] = useState(block.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashStartRef = useRef<number | null>(null);
  // Out of focus, links, inline Markdown and #tags render in place (#103 E6, #113 §2); the
  // textarea stays the editing surface and the block's one keyboard stop.
  const preview = useInlinePreview({
    content,
    isFocused,
    textareaRef,
    className: 'pr-8 text-base leading-relaxed',
  });

  // 포커스 시 자동 높이 조정
  useEffect(() => {
    if (isFocused && textareaRef.current) {
      textareaRef.current.focus();
      adjustHeight();
    }
  }, [isFocused]);

  // 내용 변경 시 높이 자동 조정
  useEffect(() => {
    adjustHeight();
  }, [content]);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    // Markdown shortcut ("# ", "- ", "[] " …): the block becomes another type instead.
    if (onMarkdownShortcut?.(content, newContent, e.target.selectionStart)) return;

    setContent(newContent);
    onUpdate({ content: newContent });

    // Slash command detection
    const cursorPos = e.target.selectionStart;
    if (
      newContent[cursorPos - 1] === '/' &&
      (cursorPos === 1 ||
        newContent[cursorPos - 2] === '\n' ||
        newContent.substring(0, cursorPos - 1).trim() === '')
    ) {
      // Just typed "/" at start of line or empty block
      slashStartRef.current = cursorPos;
      if (textareaRef.current && onSlashCommand) {
        const rect = textareaRef.current.getBoundingClientRect();
        onSlashCommand(new DOMRect(rect.left, rect.top + 24, rect.width, rect.height));
      }
    } else if (slashStartRef.current !== null) {
      // Filter while typing after /
      const filter = newContent.substring(slashStartRef.current, cursorPos);
      if (filter.includes(' ') || filter.includes('\n')) {
        // Cancel slash command on space or newline
        slashStartRef.current = null;
        onSlashClose?.();
      } else {
        onSlashFilter?.(filter);
      }
    } else if (onPageLinkTrigger && textareaRef.current) {
      // Page links: "[[" anywhere, or "@" at the start or after whitespace.
      const before = newContent.slice(0, cursorPos);
      const atMention =
        before.endsWith('@') && (cursorPos === 1 || /\s/.test(newContent[cursorPos - 2]));
      if (before.endsWith('[[') || atMention) {
        const length = atMention ? 1 : 2;
        const rect = textareaRef.current.getBoundingClientRect();
        onPageLinkTrigger(
          new DOMRect(rect.left, rect.top + 28, rect.width, rect.height),
          cursorPos - length,
          length
        );
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (slashStartRef.current !== null) {
        // Let slash command menu handle Enter
        return;
      }
      e.preventDefault();
      onAddBlock('paragraph');
    } else if (e.key === 'Backspace' && content === '') {
      e.preventDefault();
      onDelete();
    } else if (e.key === 'Backspace' && slashStartRef.current !== null) {
      const cursorPos = textareaRef.current?.selectionStart ?? 0;
      if (cursorPos <= slashStartRef.current) {
        slashStartRef.current = null;
        onSlashClose?.();
      }
    } else if (e.key === 'Escape' && slashStartRef.current !== null) {
      slashStartRef.current = null;
      onSlashClose?.();
    }
  };

  /** Clear the slash text and reset when a slash command is selected externally */
  useEffect(() => {
    // When block content gets cleared from outside (slash command selected), reset tracking
    if (block.content !== content) {
      setContent(block.content);
      slashStartRef.current = null;
    }
  }, [block.content]);

  return (
    <div
      className={`relative group ${isFocused ? 'bg-primary/10 ' : ''} rounded-lg p-2 transition-colors`}
      onFocus={(event) => !isOnPageLink(event.target) && onFocus()}
      // Focus moving within the block (to a chip in the link row below, or the delete button)
      // keeps it focused, so keyboard users can reach those links. React's blur bubbles, so this
      // also handles the textarea's.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur();
      }}
    >
      {/* The rendered text while the block is not being edited (see useInlinePreview). */}
      {preview.element && <div data-testid="paragraph-preview">{preview.element}</div>}

      {/* 단락 입력 (블록 핸들은 에디터의 왼쪽 여백에 있다) */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        placeholder={placeholder}
        className="w-full resize-none border-none outline-none bg-transparent text-base text-foreground placeholder:text-muted-foreground pl-0 pr-8 leading-relaxed"
        rows={1}
        style={preview.textareaStyle}
      />

      {/* While editing, the raw [[page:<id>]] tokens are named underneath. */}
      {isFocused && hasPageLinks(content) && (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>링크:</span>
          {extractPageLinkIds(content).map((pageId) => (
            <PageLinkChip key={pageId} pageId={pageId} className="text-xs" />
          ))}
        </div>
      )}

      {/* 액션 버튼들 */}
      {isFocused && (
        <div className="absolute right-2 top-2 flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
