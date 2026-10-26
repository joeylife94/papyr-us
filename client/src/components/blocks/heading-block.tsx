import React, { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@shared/schema';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInlinePreview } from '@/components/page/inline-preview';

interface HeadingBlockProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onAddBlock: (type?: BlockType) => void;
}

export function HeadingBlock({
  block,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
  onAddBlock,
}: HeadingBlockProps) {
  const [content, setContent] = useState(block.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onAddBlock('paragraph');
    } else if (e.key === 'Backspace' && content === '') {
      e.preventDefault();
      onDelete();
    }
  };

  const getHeadingStyle = () => {
    switch (block.type) {
      case 'heading1':
        return 'text-3xl font-bold';
      case 'heading2':
        return 'text-2xl font-semibold';
      case 'heading3':
        return 'text-xl font-medium';
      default:
        return 'text-lg font-medium';
    }
  };

  const getPlaceholder = () => {
    switch (block.type) {
      case 'heading1':
        return '제목 1';
      case 'heading2':
        return '제목 2';
      case 'heading3':
        return '제목 3';
      default:
        return '제목';
    }
  };

  // Inline Markdown, links and #tags render while the heading is not focused (#113 §2).
  const preview = useInlinePreview({
    content,
    isFocused,
    textareaRef,
    className: `${getHeadingStyle()} pr-8`,
  });

  return (
    <div
      className={`relative group ${isFocused ? 'bg-primary/10 ' : ''} rounded-lg p-2 transition-colors`}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {/* 제목 입력 (블록 핸들은 에디터의 왼쪽 여백에 있다) */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={getPlaceholder()}
        className={`w-full resize-none border-none outline-none bg-transparent ${getHeadingStyle()} text-foreground placeholder:text-muted-foreground pl-0 pr-8`}
        rows={1}
        style={preview.textareaStyle}
      />
      {preview.element}

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
