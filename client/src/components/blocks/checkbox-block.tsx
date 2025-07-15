import React, { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@shared/schema';
import { Trash2, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CheckboxBlockProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onAddBlock: (type?: BlockType) => void;
}

export function CheckboxBlock({ 
  block, 
  isFocused, 
  onFocus, 
  onBlur, 
  onUpdate, 
  onDelete, 
  onAddBlock 
}: CheckboxBlockProps) {
  const [content, setContent] = useState(block.content);
  const [isChecked, setIsChecked] = useState(block.properties?.checked || false);
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

  const handleCheckboxToggle = () => {
    const newChecked = !isChecked;
    setIsChecked(newChecked);
    onUpdate({ 
      properties: { 
        ...block.properties, 
        checked: newChecked 
      } 
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onAddBlock('checkbox');
    } else if (e.key === 'Backspace' && content === '') {
      e.preventDefault();
      onDelete();
    } else if (e.key === ' ' && e.target === textareaRef.current) {
      e.preventDefault();
      handleCheckboxToggle();
    }
  };

  return (
    <div 
      className={`relative group ${isFocused ? 'bg-blue-50 dark:bg-blue-950/20' : ''} rounded-lg p-2 transition-colors`}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="flex items-start space-x-3">
        {/* 체크박스 */}
        <button
          type="button"
          onClick={handleCheckboxToggle}
          className={`mt-1 flex-shrink-0 ${isChecked ? 'text-green-600' : 'text-gray-400'} hover:text-green-600 transition-colors`}
        >
          {isChecked ? (
            <CheckSquare className="h-5 w-5" />
          ) : (
            <Square className="h-5 w-5" />
          )}
        </button>

        {/* 텍스트 입력 */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="할 일을 입력하세요..."
          className={`flex-1 resize-none border-none outline-none bg-transparent text-base placeholder-gray-400 dark:placeholder-gray-500 leading-relaxed ${
            isChecked 
              ? 'text-gray-500 line-through' 
              : 'text-gray-900 dark:text-white'
          }`}
          rows={1}
        />

        {/* 액션 버튼들 */}
        {isFocused && (
          <div className="flex items-center space-x-1">
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
    </div>
  );
} 