import React, { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@shared/schema';
import { Trash2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  return (
    <div
      className={`relative group ${isFocused ? 'bg-blue-50 dark:bg-blue-950/20' : ''} rounded-lg p-2 transition-colors`}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {/* 블록 타입 표시 */}
      <div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Type className="h-4 w-4 text-gray-400" />
      </div>

      {/* 제목 입력 */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={getPlaceholder()}
        className={`w-full resize-none border-none outline-none bg-transparent ${getHeadingStyle()} text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 pl-8 pr-12`}
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
