import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BlockType } from '@shared/schema';
import {
  Type,
  AlignLeft,
  CheckSquare,
  Image as ImageIcon,
  Table as TableIcon,
  Code,
  Quote,
  Lightbulb,
  Video,
  Sigma,
  Link2,
  List,
  ListOrdered,
  ToggleLeft,
  AtSign,
  Heading1,
  Heading2,
  Heading3,
} from 'lucide-react';

export interface SlashCommandItem {
  type: BlockType;
  label: string;
  description: string;
  icon: React.ReactNode;
  keywords: string[]; // for fuzzy filtering
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    type: 'paragraph',
    label: '텍스트',
    description: '일반 텍스트 블록',
    icon: <AlignLeft className="h-4 w-4" />,
    keywords: ['text', 'paragraph', '텍스트', '단락'],
  },
  {
    type: 'heading1',
    label: '제목 1',
    description: '큰 제목',
    icon: <Heading1 className="h-4 w-4" />,
    keywords: ['heading', 'h1', '제목', 'title'],
  },
  {
    type: 'heading2',
    label: '제목 2',
    description: '중간 제목',
    icon: <Heading2 className="h-4 w-4" />,
    keywords: ['heading', 'h2', '제목', 'subtitle'],
  },
  {
    type: 'heading3',
    label: '제목 3',
    description: '작은 제목',
    icon: <Heading3 className="h-4 w-4" />,
    keywords: ['heading', 'h3', '제목', 'small heading'],
  },
  {
    type: 'checkbox',
    label: '할 일 목록',
    description: '체크박스가 있는 목록',
    icon: <CheckSquare className="h-4 w-4" />,
    keywords: ['todo', 'checkbox', 'task', '할일', '체크박스'],
  },
  {
    type: 'bulleted_list',
    label: '글머리 기호 목록',
    description: '순서 없는 목록',
    icon: <List className="h-4 w-4" />,
    keywords: ['bullet', 'list', 'unordered', '목록', '글머리'],
  },
  {
    type: 'numbered_list',
    label: '번호 목록',
    description: '순서 있는 목록',
    icon: <ListOrdered className="h-4 w-4" />,
    keywords: ['number', 'ordered', 'list', '번호', '목록'],
  },
  {
    type: 'toggle',
    label: '토글',
    description: '접고 펼칠 수 있는 블록',
    icon: <ToggleLeft className="h-4 w-4" />,
    keywords: ['toggle', 'collapsible', '토글', '접기'],
  },
  {
    type: 'quote',
    label: '인용',
    description: '인용구 블록',
    icon: <Quote className="h-4 w-4" />,
    keywords: ['quote', 'blockquote', '인용', '인용구'],
  },
  {
    type: 'callout',
    label: '콜아웃',
    description: '아이콘과 색상이 있는 강조 블록',
    icon: <Lightbulb className="h-4 w-4" />,
    keywords: ['callout', 'info', 'warning', 'tip', '콜아웃', '강조'],
  },
  {
    type: 'code',
    label: '코드',
    description: '코드 블록',
    icon: <Code className="h-4 w-4" />,
    keywords: ['code', 'snippet', 'programming', '코드'],
  },
  {
    type: 'image',
    label: '이미지',
    description: '이미지 업로드 또는 URL',
    icon: <ImageIcon className="h-4 w-4" />,
    keywords: ['image', 'picture', 'photo', '이미지', '사진'],
  },
  {
    type: 'table',
    label: '테이블',
    description: '표 블록',
    icon: <TableIcon className="h-4 w-4" />,
    keywords: ['table', 'grid', 'spreadsheet', '테이블', '표'],
  },
  {
    type: 'math',
    label: '수식',
    description: 'LaTeX 수식 블록',
    icon: <Sigma className="h-4 w-4" />,
    keywords: ['math', 'equation', 'latex', '수식', '수학'],
  },
  {
    type: 'embed',
    label: '임베드',
    description: '외부 콘텐츠 (YouTube, Figma 등)',
    icon: <Video className="h-4 w-4" />,
    keywords: ['embed', 'youtube', 'figma', 'iframe', '임베드'],
  },
  {
    type: 'synced_block',
    label: '동기화 블록',
    description: '다른 페이지와 동기화되는 블록',
    icon: <Link2 className="h-4 w-4" />,
    keywords: ['synced', 'sync', 'mirror', '동기화'],
  },
  {
    type: 'mention',
    label: '멘션',
    description: '사용자 또는 페이지 멘션',
    icon: <AtSign className="h-4 w-4" />,
    keywords: ['mention', 'at', 'user', 'page', '멘션'],
  },
];

interface SlashCommandMenuProps {
  isOpen: boolean;
  position: { top: number; left: number };
  filter: string;
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  isOpen,
  position,
  filter,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Filter commands based on search query
  const filteredCommands = SLASH_COMMANDS.filter((cmd) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.keywords.some((kw) => kw.toLowerCase().includes(q))
    );
  });

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex].type);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, filteredCommands, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown, true);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, handleKeyDown]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  if (!isOpen || filteredCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        width: 320,
        maxHeight: 360,
      }}
    >
      <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
        블록 타입 선택
      </div>
      <div className="overflow-y-auto max-h-[300px]">
        {filteredCommands.map((cmd, index) => (
          <button
            key={cmd.type}
            ref={(el) => { itemRefs.current[index] = el; }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
              index === selectedIndex
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
            onClick={() => onSelect(cmd.type)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                index === selectedIndex
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {cmd.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{cmd.label}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                {cmd.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
