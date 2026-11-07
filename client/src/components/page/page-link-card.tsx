import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { PageIcon } from '@/components/page/page-icon';

/** How long the pointer rests on a link before its card opens. */
export const PAGE_LINK_CARD_OPEN_DELAY_MS = 300;
/** Grace time for the pointer to move between the link and its card. */
const CLOSE_DELAY_MS = 150;

/** What the card shows: a readable target's link preview (GET /api/pages/:id/link-preview). */
export interface PageLinkCardPage {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  /** Plain text, built by the server (shared/page-excerpt.ts); rendered as text only. */
  excerpt?: string;
  updatedAt?: string;
}

/** Keyboard focus, as opposed to the focus a click or a tap gives a link. */
function hasKeyboardFocus(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

/**
 * The preview card of a page link (issue #133), Obsidian's page preview: the target's icon, title,
 * the start of its text and its last update time, with a link that opens it.
 *
 * - Opens when the pointer rests on the link for PAGE_LINK_CARD_OPEN_DELAY_MS, or at once when
 *   the link gets keyboard focus (`focusable` links only; editor previews are not in the tab
 *   order). It stays open while the pointer is on the link or the card.
 * - Closes when the pointer moves away, the link loses focus, Escape is pressed or something
 *   outside is pressed. Touch input never opens it: a tap follows the link as before.
 * - A non-modal popover: focus stays on the link and is never trapped. While open, the link is
 *   described by the card's text (`aria-describedby`), and the card is labelled by the title.
 *
 * `children` is the link itself (one element that takes a ref and event handlers).
 */
export function PageLinkCard({
  page,
  focusable,
  children,
}: {
  page: PageLinkCardPage;
  focusable: boolean;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  // The link element (the anchor's child; typed as a div by the anchor).
  const anchor = useRef<HTMLElement | null>(null);
  const pointerInside = useRef(false);
  const keyboardFocused = useRef(false);
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;

  const schedule = useCallback((next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    if (delay > 0) timer.current = window.setTimeout(() => setOpen(next), delay);
    else setOpen(next);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pointerEnter = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    pointerInside.current = true;
    // Back on the link or onto the card while it is open: keep it.
    schedule(true, open ? 0 : PAGE_LINK_CARD_OPEN_DELAY_MS);
  };
  const pointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    pointerInside.current = false;
    if (keyboardFocused.current) schedule(true, 0);
    else schedule(false, CLOSE_DELAY_MS);
  };
  const focus = (event: FocusEvent<HTMLElement>) => {
    if (!focusable || !hasKeyboardFocus(event.currentTarget)) return;
    keyboardFocused.current = true;
    schedule(true, 0);
  };
  const blur = () => {
    keyboardFocused.current = false;
    // Pressing the card moves focus off the link; the pointer on the card keeps it open.
    if (!pointerInside.current) schedule(false, 0);
  };

  const updated = page.updatedAt ? new Date(page.updatedAt) : null;
  const validUpdate = updated && !Number.isNaN(updated.getTime()) ? updated : null;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // Escape, a press outside or focus moving elsewhere.
        if (!next) schedule(false, 0);
      }}
    >
      <PopoverPrimitive.Anchor
        asChild
        ref={(node: HTMLElement | null) => {
          anchor.current = node;
        }}
        onPointerEnter={pointerEnter}
        onPointerLeave={pointerLeave}
        onFocus={focus}
        onBlur={blur}
        aria-describedby={open ? bodyId : undefined}
      >
        {children}
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-testid="page-link-card"
          data-page-link-card={page.id}
          aria-labelledby={titleId}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          hideWhenDetached
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // The link is outside the card: focusing or pressing it is not "outside" (the card
          // opens on that very focus, which would otherwise close it again).
          onInteractOutside={(event) => {
            if (anchor.current?.contains(event.target as Node)) event.preventDefault();
          }}
          onPointerEnter={pointerEnter}
          onPointerLeave={pointerLeave}
          // The card is in the link's React tree (a portal): presses on it must not reach the
          // block or reader around the link. Editor previews also keep focus where it is.
          onClick={stopPropagation}
          onMouseDown={(event) => {
            event.stopPropagation();
            if (!focusable) event.preventDefault();
          }}
          className="z-50 w-80 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <div className="flex min-w-0 items-center gap-2">
            <PageIcon icon={page.icon} className="text-[16px]" />
            <span id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold">
              {page.title}
            </span>
          </div>
          <div id={bodyId}>
            <p
              data-testid="page-link-card-excerpt"
              className="mt-2 whitespace-normal break-words text-[13px] leading-relaxed text-foreground-secondary"
            >
              {page.excerpt ? (
                page.excerpt
              ) : (
                <span className="text-muted-foreground">내용이 없는 문서입니다.</span>
              )}
            </p>
            {validUpdate && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                마지막 수정{' '}
                <time
                  dateTime={validUpdate.toISOString()}
                  title={format(validUpdate, 'yyyy-MM-dd HH:mm')}
                >
                  {formatDistanceToNow(validUpdate, { addSuffix: true, locale: ko })}
                </time>
              </p>
            )}
          </div>
          <div className="mt-2 flex justify-end">
            <Link
              to={`/page/${page.slug}`}
              onMouseDown={focusable ? undefined : (event) => event.preventDefault()}
              className="rounded px-1.5 py-0.5 text-xs font-medium text-highlight hover:bg-highlight/10 hover:underline"
            >
              열기
            </Link>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
