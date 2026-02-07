import React, { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@shared/schema';
import { Trash2, AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}

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
}: ParagraphBlockProps) {
  const [content, setContent] = useState(block.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashStartRef = useRef<number | null>(null);

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
    setContent(newContent);
    onUpdate({ content: newContent });

    // Slash command detection
    const cursorPos = e.target.selectionStart;
    if (newContent[cursorPos - 1] === '/' && (cursorPos === 1 || newContent[cursorPos - 2] === '\n' || newContent.substring(0, cursorPos - 1).trim() === '')) {
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
      className={`relative group ${isFocused ? 'bg-blue-50 dark:bg-blue-950/20' : ''} rounded-lg p-2 transition-colors`}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {/* 블록 타입 표시 */}
      <div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <AlignLeft className="h-4 w-4 text-gray-400" />
      </div>

      {/* 단락 입력 */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="단락을 입력하세요..."
        className="w-full resize-none border-none outline-none bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 pl-8 pr-12 leading-relaxed"
        rows={1}
      />

      {/* 액션 버튼들 */}
      {isFocused && (
        <div className="absolute right-2 top-2 flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
