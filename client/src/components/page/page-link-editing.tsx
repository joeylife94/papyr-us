import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPageLink } from '@shared/page-links';
import { cn } from '@/lib/utils';
import { useInlinePreview } from './inline-preview';
import { PageIcon } from './page-icon';
import { PAGE_LINK_QUERY_KEY, type ResolvedPageLink } from './page-link-data';
import { findPageLinkTrigger, type PageLinkTrigger } from './page-link-trigger';

/**
 * Page links in the block editor (#103 E6).
 *
 * - Picker: `@` at a word boundary or `[[` opens a title search over the pages the viewer can
 *   read in the edited page's workspace scope. It follows the ARIA combobox pattern on the
 *   block's textarea; ↑/↓ move, Enter/Tab insert `[[page:<id>]]`, Esc closes and keeps the text.
 * - Live preview: out of focus, a block shows its links as chips, together with its other inline
 *   Markdown (#113 §2); see `useInlinePreview` in `inline-preview.tsx`.
 */

export interface PageLinkEditorScope {
  /** Workspace scope of the edited page: its team id (or team name), or null for team-less. */
  team: number | string | null;
  /** The edited page, left out of the picker. */
  pageId?: number;
  /** The slash command asked this block to open the picker (it has just typed `@`). */
  pickerRequest: { blockId: string; nonce: number } | null;
}

export const PageLinkEditorContext = createContext<PageLinkEditorScope | null>(null);

interface TitleSearchPage {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
}

const SEARCH_DEBOUNCE_MS = 120;
const SEARCH_LIMIT = 8;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface Options {
  blockId: string;
  /** The block's current text (its controlled textarea value). */
  content: string;
  isFocused: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** Apply a new text to the block (local state and `onUpdate`). */
  onContentChange: (next: string) => void;
  /** Typography of the preview, matching the block's textarea. */
  previewClassName?: string;
}

export function usePageLinkEditing({
  blockId,
  content,
  isFocused,
  textareaRef,
  onContentChange,
  previewClassName,
}: Options) {
  const scope = useContext(PageLinkEditorContext);
  const queryClient = useQueryClient();
  const listboxId = useId();
  const [trigger, setTrigger] = useState<PageLinkTrigger | null>(null);
  const [active, setActive] = useState(0);
  // Esc closes the picker for this trigger only; typing a new trigger opens it again.
  const dismissedStart = useRef<number | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const handledRequest = useRef<number | null>(null);

  const open = !!scope && trigger !== null;
  const query = useDebouncedValue(trigger?.query.trim() ?? '', SEARCH_DEBOUNCE_MS);
  const team = scope?.team ?? null;
  const excludeId = scope?.pageId;

  const search = useQuery<{ pages: TitleSearchPage[] }>({
    queryKey: ['/api/pages/title-search', team, excludeId ?? null, query],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ q: query, limit: String(SEARCH_LIMIT) });
      if (team !== null && team !== '') params.set('teamId', String(team));
      if (excludeId) params.set('exclude', String(excludeId));
      const res = await fetch(`/api/pages/title-search?${params}`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) throw new Error(`title search ${res.status}`);
      return res.json();
    },
    enabled: open,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
  const pages = open ? (search.data?.pages ?? []) : [];
  const activeIndex = pages.length > 0 ? Math.min(active, pages.length - 1) : -1;
  const optionId = (pageId: number) => `${listboxId}-page-${pageId}`;

  const close = useCallback(() => setTrigger(null), []);

  const select = (page: TitleSearchPage) => {
    if (!trigger) return;
    const token = formatPageLink(page.id);
    const next = content.slice(0, trigger.start) + token + content.slice(trigger.end);
    // The chip can show the title at once; it is re-resolved (access-checked) when it renders.
    queryClient.setQueryData<ResolvedPageLink>([PAGE_LINK_QUERY_KEY, page.id], {
      id: page.id,
      accessible: true,
      title: page.title,
      slug: page.slug,
      icon: page.icon,
    });
    pendingCaret.current = trigger.start + token.length;
    dismissedStart.current = null;
    setTrigger(null);
    onContentChange(next);
  };

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !textareaRef.current) return;
    pendingCaret.current = null;
    textareaRef.current.setSelectionRange(caret, caret);
  }, [content, textareaRef]);

  // The slash command's "페이지 링크" entry types `@` into this block and asks for the picker.
  useEffect(() => {
    const request = scope?.pickerRequest;
    if (!request || request.blockId !== blockId || handledRequest.current === request.nonce) {
      return;
    }
    if (!content.endsWith('@')) return; // the block's new text has not arrived yet
    handledRequest.current = request.nonce;
    const end = content.length;
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(end, end);
    dismissedStart.current = null;
    setActive(0);
    setTrigger({ kind: '@', start: end - 1, end, query: '' });
  }, [scope?.pickerRequest, blockId, content, textareaRef]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(pages[activeIndex].id))?.scrollIntoView({ block: 'nearest' });
    // optionId only depends on the stable listbox id.
  }, [activeIndex, pages]);

  /** Call from the textarea's change handler, after the block's own handling. */
  const handleInput = (
    event: ChangeEvent<HTMLTextAreaElement>,
    { suspended = false }: { suspended?: boolean } = {}
  ) => {
    if (!scope) return;
    if (suspended) {
      // Another menu (the slash command) owns the keyboard right now.
      if (trigger) setTrigger(null);
      return;
    }
    const found = findPageLinkTrigger(event.target.value, event.target.selectionStart);
    if (!found) {
      dismissedStart.current = null;
      if (trigger) setTrigger(null);
      return;
    }
    if (dismissedStart.current === found.start) return;
    if (!trigger || trigger.start !== found.start) setActive(0);
    setTrigger(found);
  };

  /** Call first in the textarea's keydown handler; true means the picker used the key. */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || event.nativeEvent.isComposing) return false;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (pages.length === 0) return false;
        event.preventDefault();
        setActive(
          (activeIndex + (event.key === 'ArrowDown' ? 1 : pages.length - 1)) % pages.length
        );
        return true;
      case 'Enter':
      case 'Tab':
        if (event.shiftKey || activeIndex < 0) {
          close();
          return false;
        }
        event.preventDefault();
        select(pages[activeIndex]);
        return true;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        dismissedStart.current = trigger!.start;
        close();
        return true;
      default:
        return false;
    }
  };

  // The caret left the trigger (click, arrow keys): close; still inside: follow the query.
  const handleSelect = () => {
    const el = textareaRef.current;
    if (!trigger || !el) return;
    const found = findPageLinkTrigger(el.value, el.selectionStart);
    if (!found || found.start !== trigger.start) close();
    else if (found.end !== trigger.end) setTrigger(found);
  };

  const preview = useInlinePreview({
    content,
    isFocused,
    textareaRef,
    className: previewClassName,
  });

  const textareaProps = {
    style: preview.textareaStyle,
    onSelectCapture: handleSelect,
    onBlurCapture: close,
    ...(open
      ? {
          role: 'combobox' as const,
          'aria-expanded': true,
          'aria-controls': listboxId,
          'aria-autocomplete': 'list' as const,
          'aria-activedescendant': activeIndex >= 0 ? optionId(pages[activeIndex].id) : undefined,
        }
      : {}),
  };

  let announcement = '';
  if (open && !search.isFetching) {
    announcement = pages.length > 0 ? `링크할 문서 ${pages.length}개` : '일치하는 문서가 없습니다';
  }

  const overlay: ReactNode = (
    <>
      {preview.element}
      {open && (
        <div
          data-testid="page-link-picker"
          className="absolute left-0 top-full z-50 mt-1 w-80 max-w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="border-b border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            문서 링크
          </div>
          <ul
            id={listboxId}
            role="listbox"
            aria-label="링크할 문서"
            className="max-h-64 overflow-y-auto py-1"
          >
            {pages.map((page, index) => (
              <li
                key={page.id}
                id={optionId(page.id)}
                role="option"
                aria-selected={index === activeIndex}
                // Keep the caret in the textarea while choosing with the mouse.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => select(page)}
                className={cn(
                  'flex min-h-9 cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                  index === activeIndex
                    ? 'bg-accent text-foreground'
                    : 'text-foreground-secondary hover:bg-muted'
                )}
              >
                <PageIcon icon={page.icon} />
                <span className="truncate">{page.title}</span>
              </li>
            ))}
          </ul>
          {pages.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {search.isFetching || search.isPending ? '찾는 중…' : '일치하는 문서가 없습니다'}
            </p>
          )}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );

  return { handleInput, handleKeyDown, textareaProps, overlay, previewing: preview.previewing };
}
