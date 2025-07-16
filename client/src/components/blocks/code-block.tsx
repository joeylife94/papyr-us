import React, { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@shared/schema';
import { Trash2, Code, Copy, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface CodeBlockProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onAddBlock: (type?: BlockType) => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'gitignore', label: '.gitignore' },
  { value: 'plaintext', label: 'Plain Text' },
];

export function CodeBlock({ 
  block, 
  isFocused, 
  onFocus, 
  onBlur, 
  onUpdate, 
  onDelete, 
  onAddBlock 
}: CodeBlockProps) {
  const [content, setContent] = useState(block.content);
  const [language, setLanguage] = useState(block.properties?.language || 'javascript');
  const [isCopied, setIsCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

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

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    onUpdate({
      properties: {
        ...block.properties,
        language: newLanguage
      }
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      toast({
        title: "코드 복사됨",
        description: "코드가 클립보드에 복사되었습니다."
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast({
        title: "복사 실패",
        description: "코드를 복사할 수 없습니다.",
        variant: "destructive"
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onAddBlock('paragraph');
    } else if (e.key === 'Backspace' && content === '') {
      e.preventDefault();
      onDelete();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const start = textareaRef.current?.selectionStart || 0;
      const end = textareaRef.current?.selectionEnd || 0;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      onUpdate({ content: newContent });
      
      // 커서 위치 조정
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const getLanguageLabel = (lang: string) => {
    const option = LANGUAGE_OPTIONS.find(opt => opt.value === lang);
    return option?.label || lang;
  };

  return (
    <div 
      className={`relative group ${isFocused ? 'bg-blue-50 dark:bg-blue-950/20' : ''} rounded-lg p-4 transition-colors`}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* 블록 타입 표시 */}
      <div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Code className="h-4 w-4 text-gray-400" />
      </div>

      {/* 코드 블록 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {getLanguageLabel(language)}
          </span>
        </div>

        {/* 액션 버튼들 */}
        {isFocused && (
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 w-6 p-0 text-gray-400 hover:text-green-600"
            >
              {isCopied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
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

      {/* 코드 입력 영역 */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={`${getLanguageLabel(language)} 코드를 입력하세요...`}
          className={`
            w-full resize-none border-none outline-none bg-transparent
            font-mono text-sm leading-relaxed
            text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
            bg-gray-50 dark:bg-gray-900 rounded-md p-3
            focus:ring-2 focus:ring-primary focus:ring-inset
          `}
          rows={Math.max(3, content.split('\n').length)}
          spellCheck={false}
        />
        
        {/* 라인 번호 (선택사항) */}
        {content.includes('\n') && (
          <div className="absolute left-3 top-3 text-xs text-gray-400 select-none pointer-events-none">
            {content.split('\n').map((_, index) => (
              <div key={index} className="leading-relaxed">
                {index + 1}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 코드 정보 */}
      <div className="mt-2 text-xs text-muted-foreground">
        {content.split('\n').length}줄, {content.length}자
      </div>
    </div>
  );
} 