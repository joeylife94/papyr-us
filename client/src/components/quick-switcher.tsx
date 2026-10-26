import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PageIcon } from '@/components/page/page-icon';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentPageScope } from '@/hooks/usePageScope';
import { focusPageBodyWhenReady } from '@/lib/page-open';
import { invalidatePageLists } from '@/lib/queryClient';
import { slugForTitle } from '@/lib/page-content';
import { scopeTeamParam, type CurrentPageScope } from '@/lib/page-scope';
import { getUserName } from '@/lib/user';
import { cn } from '@/lib/utils';
import type { Block } from '@shared/schema';

const OPEN_EVENT = 'papyrus:open-quick-switcher';
const SEARCH_DEBOUNCE_MS = 150;
// New pages land where /create puts them by default.
const NEW_PAGE_FOLDER = 'docs';

/** Open the quick switcher from elsewhere (the command palette). */
export function openQuickSwitcher() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** A result of the page search the link picker uses (GET /api/page-links/search, #103 E6). */
interface TitleMatch {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  updatedAt: string;
}

type SwitcherOption = { kind: 'page'; page: TitleMatch } | { kind: 'create'; title: string };

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Quick switcher (#111): Ctrl/Cmd+O, or "빠른 전환" in the command palette. Finds readable pages
 * of the current workspace scope by title as you type and opens one; when no title matches
 * exactly, the last option creates a page with the typed title in that scope and opens it with
 * the caret in its body. Mounted once, in the app layout.
 */
export function QuickSwitcher() {
  const [open, setOpenState] = useState(false);
  const navigate = useNavigate();
  const isOpen = useRef(false);
  // Closing returns focus to where it was when the switcher opened (there is no trigger
  // button), except after opening a page: then the caret goes to that page.
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const keepFocusOnPage = useRef(false);
  // Each opening starts empty, even when it reopens during the closing animation (while the
  // previous content is still mounted).
  const [session, setSession] = useState(0);

  const setOpen = (next: boolean) => {
    if (next && !isOpen.current) {
      returnFocusTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSession((value) => value + 1);
    }
    isOpen.current = next;
    setOpenState(next);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
        // Ctrl+O would otherwise open the browser's "open file" dialog.
        e.preventDefault();
        setOpen(!isOpen.current);
      }
    };
    const onOpenRequest = () => setOpen(true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenRequest);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenRequest);
    };
  }, []);

  const openPage = (path: string) => {
    keepFocusOnPage.current = true;
    setOpen(false);
    navigate(path);
    focusPageBodyWhenReady(path);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[12%] w-[calc(100%-2rem)] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-lg p-0 data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocusTo.current;
          returnFocusTo.current = null;
          if (keepFocusOnPage.current) {
            keepFocusOnPage.current = false;
          } else if (target?.isConnected) {
            target.focus();
          }
        }}
      >
        <SwitcherBody key={session} onOpenPage={openPage} />
      </DialogContent>
    </Dialog>
  );
}

function SwitcherBody({ onOpenPage }: { onOpenPage: (path: string) => void }) {
  const scope = useCurrentPageScope();
  const teamParam = scopeTeamParam(scope);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  // A choice made before the results for the typed text arrived, carried out once they do, so
  // it never acts on results of an earlier query. `query` is the text it was made for.
  const [pending, setPending] = useState<{ kind: 'enter' | 'create'; query: string } | null>(null);

  const query = input.trim();
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  // The link picker's search (#103 E6): readable titles of the scope, exact match first.
  const search = useQuery<TitleMatch[]>({
    queryKey: ['/api/page-links/search', teamParam, debouncedQuery],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ q: debouncedQuery });
      if (teamParam) params.set('teamId', teamParam);
      const res = await fetch(`/api/page-links/search?${params}`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) throw new Error(`page search ${res.status}`);
      return res.json();
    },
    enabled: scope.status === 'ready',
    placeholderData: keepPreviousData,
    // Every opening searches afresh, so a page created meanwhile is found, not duplicated.
    staleTime: 0,
  });

  const pages = search.data ?? [];
  const current = debouncedQuery === query && !search.isPlaceholderData && !search.isFetching;
  const settled = scope.status === 'ready' && current && (search.isSuccess || search.isError);
  const exactMatch = (list: TitleMatch[]) =>
    list.find((page) => page.title.trim().toLowerCase() === query.toLowerCase());

  const options: SwitcherOption[] = pages.map((page) => ({ kind: 'page', page }));
  if (query && !exactMatch(pages)) options.push({ kind: 'create', title: query });
  const active = Math.min(activeIndex, Math.max(options.length - 1, 0));
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActiveIndex(0), [query, search.data]);

  useEffect(() => {
    if (options.length > 0) {
      document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    }
  }, [active, options.length]);

  // Carry out a pending choice on the fresh results: Enter takes the first option, as it would
  // have with the results on screen; "새 문서" opens the page that turned out to have exactly
  // that title instead of creating a duplicate.
  useEffect(() => {
    if (pending === null) return;
    if (pending.query !== query) {
      setPending(null);
      return;
    }
    if (!settled) return;
    setPending(null);
    if (pending.kind === 'enter') {
      choose(options[0]);
      return;
    }
    const match = exactMatch(pages);
    if (match) onOpenPage(`/page/${match.slug}`);
    else void createPage(query);
  }, [pending, query, settled, pages]);

  async function createPage(title: string) {
    if (creating || scope.status !== 'ready') return;
    setCreating(true);
    const paragraph: Block = {
      id: `block_${Date.now()}`,
      type: 'paragraph',
      content: '',
      properties: {},
      order: 0,
      children: [],
    };
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title,
          slug: slugForTitle(title),
          content: '',
          blocks: [paragraph],
          folder: NEW_PAGE_FOLDER,
          tags: [],
          author: user?.name || getUserName() || 'User',
          ...(scope.teamId !== null ? { teamId: scope.teamId } : {}),
        }),
      });
      if (!res.ok) throw new Error(`create ${res.status}`);
      const created: { slug: string } = await res.json();
      void invalidatePageLists(queryClient);
      onOpenPage(`/page/${created.slug}`);
    } catch {
      setCreating(false);
      toast({
        title: '문서를 만들지 못했습니다',
        description: '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  }

  function choose(option: SwitcherOption | undefined) {
    if (!option || creating) return;
    if (option.kind === 'page') {
      onOpenPage(`/page/${option.page.slug}`);
    } else if (settled) {
      void createPage(option.title);
    } else {
      setPending({ kind: 'create', query });
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter that confirms an IME composition (Korean input) is not a selection.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((active + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (settled) choose(options[active]);
      else setPending({ kind: 'enter', query });
    }
  };

  const status = statusText(scope, {
    creating: creating || pending?.kind === 'create',
    failed: search.isError && current,
    settled,
    count: pages.length,
    canCreate: options.some((option) => option.kind === 'create'),
  });

  return (
    <>
      <DialogTitle className="sr-only">빠른 전환</DialogTitle>
      <DialogDescription className="sr-only">
        문서 제목을 입력해 이동하거나, 입력한 제목으로 새 문서를 만듭니다.
      </DialogDescription>
      <div className="flex items-center gap-2 border-b border-border px-3 pr-11">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label="문서 제목"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
          aria-busy={creating || undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={creating}
          placeholder="문서 제목으로 이동… (Ctrl+O)"
          className="h-12 w-full min-w-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="문서"
        className="max-h-[min(360px,55vh)] overflow-y-auto p-1.5 empty:hidden"
      >
        {options.map((option, index) => (
          <li
            key={option.kind === 'page' ? `page-${option.page.id}` : 'create'}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={() => index !== active && setActiveIndex(index)}
            onClick={() => choose(option)}
            className={cn(
              'flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13.5px]',
              index === active ? 'bg-raised text-foreground' : 'text-foreground-secondary'
            )}
          >
            {option.kind === 'page' ? (
              <>
                <PageIcon icon={option.page.icon} className="w-4 text-center" />
                <span className="min-w-0 flex-1 truncate">{option.page.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(option.page.updatedAt), {
                    addSuffix: true,
                    locale: ko,
                  })}
                </span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  새 문서: <span className="font-semibold text-foreground">{option.title}</span>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate" role="status" aria-live="polite">
          {status}
        </span>
        <span className="hidden shrink-0 font-mono sm:inline" aria-hidden="true">
          ↑↓ 이동 · Enter 열기 · Esc 닫기
        </span>
      </div>
    </>
  );
}

function statusText(
  scope: CurrentPageScope,
  state: { creating: boolean; failed: boolean; settled: boolean; count: number; canCreate: boolean }
): string {
  if (scope.status !== 'ready') return '워크스페이스를 불러오는 중…';
  if (state.creating) return '문서를 만드는 중…';
  if (state.failed) return `${scope.label} · 문서를 검색하지 못했습니다`;
  if (!state.settled) return `${scope.label} · 검색 중…`;
  if (state.count === 0) {
    return state.canCreate
      ? `${scope.label} · 일치하는 문서가 없습니다. Enter로 새 문서를 만듭니다`
      : `${scope.label} · 문서가 없습니다`;
  }
  return `${scope.label} · 문서 ${state.count}개`;
}
