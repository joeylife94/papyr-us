import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  FileText,
  Plus,
  Search,
  Settings,
  Home,
  Users,
  Database,
  Calendar,
  BarChart3,
  CheckSquare,
  FolderOpen,
  Brain,
  Zap,
  Moon,
  Sun,
  BookOpen,
} from 'lucide-react';
import type { WikiPage } from '@shared/schema';
import { useTheme } from '@/hooks/use-theme';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  // Fetch pages for search
  const { data: pagesData } = useQuery<{ pages: WikiPage[]; total: number }>({
    queryKey: ['/api/pages', '', '', '', 'updated'],
    queryFn: async () => {
      const res = await fetch('/api/pages?limit=50&offset=0&sort=updated');
      if (!res.ok) return { pages: [], total: 0 };
      return res.json();
    },
    enabled: open,
    staleTime: 30000,
  });

  const pages = pagesData?.pages || [];

  // Global keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    []
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="페이지 검색, 명령어 실행... (Ctrl+K)" />
      <CommandList>
        <CommandEmpty>결과를 찾을 수 없습니다.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="빠른 작업">
          <CommandItem onSelect={() => runCommand(() => navigate('/create'))}>
            <Plus className="mr-2 h-4 w-4" />
            <span>새 페이지 만들기</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/ai-search'))}>
            <Brain className="mr-2 h-4 w-4" />
            <span>AI 검색</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => setTheme(theme === 'dark' ? 'light' : 'dark'))
            }
          >
            {theme === 'dark' ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            <span>{theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Navigation */}
        <CommandGroup heading="이동">
          <CommandItem onSelect={() => runCommand(() => navigate('/'))}>
            <Home className="mr-2 h-4 w-4" />
            <span>홈</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/dashboard'))}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>대시보드</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/tasks'))}>
            <CheckSquare className="mr-2 h-4 w-4" />
            <span>태스크</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/database'))}>
            <Database className="mr-2 h-4 w-4" />
            <span>데이터베이스</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/files'))}>
            <FolderOpen className="mr-2 h-4 w-4" />
            <span>파일 관리</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/members'))}>
            <Users className="mr-2 h-4 w-4" />
            <span>멤버</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/templates'))}>
            <BookOpen className="mr-2 h-4 w-4" />
            <span>템플릿</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/automation'))}>
            <Zap className="mr-2 h-4 w-4" />
            <span>자동화</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/knowledge-graph'))}>
            <Brain className="mr-2 h-4 w-4" />
            <span>지식 그래프</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/admin'))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>관리자 설정</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Recent Pages */}
        {pages.length > 0 && (
          <CommandGroup heading="최근 페이지">
            {pages.slice(0, 10).map((page) => (
              <CommandItem
                key={page.id}
                value={`${page.title} ${page.folder} ${page.tags.join(' ')}`}
                onSelect={() => runCommand(() => navigate(`/page/${page.slug}`))}
              >
                <FileText className="mr-2 h-4 w-4" />
                <span>{page.title}</span>
                <CommandShortcut className="text-xs text-slate-400">
                  {page.folder}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
