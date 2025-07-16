import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { 
  Quote,
  Trash2,
  Edit3,
  Check,
  X
} from 'lucide-react';

interface QuoteBlockProps {
  block: any;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: any) => void;
  onDelete: () => void;
  onAddBlock: (type?: any) => void;
}

export function QuoteBlock({ block, isFocused, onFocus, onBlur, onUpdate, onDelete, onAddBlock }: QuoteBlockProps) {
  const content = block.content || '';
  const source = block.properties?.source || '';
  const author = block.properties?.author || '';
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [editSource, setEditSource] = useState(source || '');
  const [editAuthor, setEditAuthor] = useState(author || '');

  const handleSave = () => {
    onUpdate({
      content: editContent,
      properties: {
        ...block.properties,
        source: editSource || undefined,
        author: editAuthor || undefined
      }
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(content);
    setEditSource(source || '');
    setEditAuthor(author || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="group relative border-l-4 border-primary bg-muted/30 p-4 rounded-r-lg">
        <div className="flex items-start gap-3">
          <Quote className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="인용문을 입력하세요..."
              className="min-h-[80px] resize-none border-0 bg-transparent p-0 text-base font-medium italic focus-visible:ring-0"
            />
            
            <div className="space-y-2">
              <Input
                value={editAuthor}
                onChange={(e) => setEditAuthor(e.target.value)}
                placeholder="작성자 (선택사항)"
                className="h-8 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
              />
              <Input
                value={editSource}
                onChange={(e) => setEditSource(e.target.value)}
                placeholder="출처 (선택사항)"
                className="h-8 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
              />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" onClick={handleSave} className="h-8">
            <Check className="h-4 w-4 mr-1" />
            저장
          </Button>
          <Button size="sm" variant="outline" onClick={handleCancel} className="h-8">
            <X className="h-4 w-4 mr-1" />
            취소
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative border-l-4 border-primary bg-muted/30 p-4 rounded-r-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        <Quote className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
        <div className="flex-1">
          <blockquote className="text-base font-medium italic text-foreground mb-2">
            "{content}"
          </blockquote>
          
          {(author || source) && (
            <div className="text-sm text-muted-foreground">
              {author && <span className="font-medium">— {author}</span>}
              {author && source && <span className="mx-2">•</span>}
              {source && <span>{source}</span>}
            </div>
          )}
        </div>
      </div>
      
      {/* 편집 버튼들 */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditing(true)}
            className="h-8 w-8 p-0"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
} 