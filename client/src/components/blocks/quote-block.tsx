import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Quote, Trash2, Edit3, Check, X } from 'lucide-react';
import { useInlinePreview } from '@/components/page/inline-preview';

interface QuoteBlockProps {
  block: any;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: any) => void;
  onDelete: () => void;
  onAddBlock: (type?: any) => void;
}

/**
 * A quote. The quoted text is edited in place, like a paragraph (so a `> ` markdown shortcut can
 * keep typing into it, #111 §6); author and source are edited from the hover button.
 */
export function QuoteBlock({
  block,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
  onAddBlock,
}: QuoteBlockProps) {
  const [content, setContent] = useState<string>(block.content || '');
  const source = block.properties?.source || '';
  const author = block.properties?.author || '';
  const [isEditing, setIsEditing] = useState(false);
  const [editSource, setEditSource] = useState(source || '');
  const [editAuthor, setEditAuthor] = useState(author || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Inline Markdown, links and #tags render while the quote is not focused (#113 §2).
  const preview = useInlinePreview({
    content,
    isFocused,
    textareaRef,
    className: 'text-base font-medium italic leading-relaxed',
  });

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    if (isFocused && textareaRef.current) {
      textareaRef.current.focus();
      adjustHeight();
    }
  }, [isFocused]);

  useEffect(() => {
    adjustHeight();
  }, [content]);

  // Follow changes made elsewhere (a collaborator, a restore).
  useEffect(() => {
    if ((block.content || '') !== content) setContent(block.content || '');
  }, [block.content]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    onUpdate({ content: e.target.value });
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

  const handleSave = () => {
    onUpdate({
      properties: {
        ...block.properties,
        source: editSource || undefined,
        author: editAuthor || undefined,
      },
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditSource(source || '');
    setEditAuthor(author || '');
    setIsEditing(false);
  };

  return (
    <div
      className="group relative rounded-r-lg border-l-4 border-primary bg-muted/30 py-3 pl-4 pr-20 transition-colors hover:bg-muted/50"
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="flex items-start gap-3">
        <Quote className="mt-1 h-5 w-5 flex-shrink-0 text-highlight" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder="인용문을 입력하세요..."
            className="w-full resize-none border-none bg-transparent p-0 text-base font-medium italic leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            rows={1}
            style={preview.textareaStyle}
          />
          {preview.element}

          {isEditing ? (
            <div className="mt-2 space-y-2">
              <Input
                value={editAuthor}
                onChange={(e) => setEditAuthor(e.target.value)}
                placeholder="작성자 (선택사항)"
                className="h-8 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
              />
              <Input
                value={editSource}
                onChange={(e) => setEditSource(e.target.value)}
                placeholder="출처 (선택사항)"
                className="h-8 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSave} className="h-8">
                  <Check className="mr-1 h-4 w-4" />
                  저장
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} className="h-8">
                  <X className="mr-1 h-4 w-4" />
                  취소
                </Button>
              </div>
            </div>
          ) : (
            (author || source) && (
              <div className="mt-1 text-sm text-muted-foreground">
                {author && <span className="font-medium">— {author}</span>}
                {author && source && <span className="mx-2">•</span>}
                {source && <span>{source}</span>}
              </div>
            )
          )}
        </div>
      </div>

      {/* 편집 버튼들 */}
      <div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditing(true)}
            aria-label="작성자와 출처 편집"
            title="작성자와 출처 편집"
            className="h-8 w-8 p-0"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            aria-label="인용 삭제"
            title="인용 삭제"
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
