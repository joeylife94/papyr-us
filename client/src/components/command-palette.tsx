import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  CalendarDays,
  ArrowRightLeft,
} from 'lucide-react';
import type { WikiPage } from '@shared/schema';
import { useTheme } from '@/hooks/use-theme';
import { openQuickSwitcher } from '@/components/quick-switcher';
import { PageIcon } from '@/components/page/page-icon';
import { useOpenDailyNote } from '@/hooks/useDailyNote';
import { scopeTeamParam } from '@/lib/page-scope';

interface TitleMatch {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
}

const SEARCH_DEBOUNCE_MS = 200;

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

  // Beyond the recent pages, typed text also searches every readable page title of the current
  // scope on the server (#111), through the same endpoint as the quick switcher.
  const { openDailyNote, scope } = useOpenDailyNote();
  const teamParam = scopeTeamParam(scope);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);
  const { data: titleData } = useQuery<{ pages: TitleMatch[] }>({
    queryKey: ['/api/pages/title-search', teamParam, debouncedSearch, 'palette'],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debouncedSearch, limit: '10' });
      if (teamParam) params.set('teamId', teamParam);
      const res = await fetch(`/api/pages/title-search?${params}`, { credentials: 'include' });
      if (!res.ok) return { pages: [] };
      return res.json();
    },
    enabled: open && !!debouncedSearch && scope.status === 'ready',
    staleTime: 0,
  });
  const recentIds = new Set(pages.slice(0, 10).map((page) => page.id));
  const searchedPages = debouncedSearch
    ? (titleData?.pages ?? []).filter((page) => !recentIds.has(page.id))
    : [];

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

  // Alt+Shift+D: today's note (#111). `code`, since Option+Shift+D types a symbol on macOS.
  const openDailyNoteRef = useRef(openDailyNote);
  openDailyNoteRef.current = openDailyNote;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyD') {
        e.preventDefault();
        setOpen(false);
        void openDailyNoteRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="페이지 검색, 명령어 실행... (Ctrl+K)"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>결과를 찾을 수 없습니다.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="빠른 작업">
          <CommandItem onSelect={() => runCommand(() => navigate('/create'))}>
            <Plus className="mr-2 h-4 w-4" />
            <span>새 페이지 만들기</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(openQuickSwitcher)}>
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            <span>빠른 전환</span>
            <CommandShortcut>⌘O</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => void openDailyNote())}>
            <CalendarDays className="mr-2 h-4 w-4" />
            <span>오늘의 노트</span>
            <CommandShortcut>⌥⇧D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/ai-search'))}>
            <Brain className="mr-2 h-4 w-4" />
            <span>AI 검색</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}
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
                <PageIcon icon={page.icon} className="mr-2 h-4 w-4 text-[15px] opacity-100" />
                <span>{page.title}</span>
                <CommandShortcut className="text-xs text-muted-foreground">
                  {page.folder}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Server title search (#111) */}
        {searchedPages.length > 0 && (
          <CommandGroup heading="페이지 검색">
            {searchedPages.map((page) => (
              <CommandItem
                key={`search-${page.id}`}
                value={`${page.title} search-${page.id}`}
                onSelect={() => runCommand(() => navigate(`/page/${page.slug}`))}
              >
                <PageIcon icon={page.icon} className="mr-2 w-4 text-center" />
                <span>{page.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
