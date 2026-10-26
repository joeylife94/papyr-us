import {
  useMemo,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from 'react-router-dom';
import {
  hasInlineMarkup,
  parseInlineMarkdown,
  TAG_CHIP_CLASS,
  tagHref,
  type InlineNode,
} from '@/lib/inline-markdown';
import { cn } from '@/lib/utils';
import { PageLinkChip } from './page-links';

/**
 * Obsidian-style live preview for text blocks (#113 §2, generalizing the link preview of
 * #103 E6).
 *
 * A text block whose text holds inline Markdown, a page link token or a `#tag` shows it rendered
 * while the block is not focused. The textarea stays mounted (visually hidden, still focusable),
 * so Tab, clicks and any code that focuses a block's textarea switch it back to the source.
 * Blocks without inline markup keep their plain textarea.
 *
 * Accessibility: the preview is exposed to assistive technology, because it is what the block
 * says (emphasis, code, link text, page titles), and its links can be followed from a screen
 * reader's browse mode. The preview itself is not focusable, and its links and chips leave the
 * tab order (tabIndex -1, and a mouse press does not move focus): the textarea stays the block's
 * single keyboard stop and editing surface, and focusing it shows the source. The textarea is
 * never aria-hidden, since it must stay focusable; browse mode therefore also passes the hidden
 * field with the source text.
 */

const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  opacity: 0,
};

/** Text and code elements carry the source offset of their first character. */
const SOURCE_OFFSET_ATTRIBUTE = 'data-source-offset';

const linkClass =
  'font-medium text-highlight underline decoration-highlight/40 underline-offset-2 transition-colors hover:decoration-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Editor previews keep focus where it is when a link is pressed (see `PageLinkChip`). */
function keepFocus(event: MouseEvent) {
  event.preventDefault();
}

/** A `#tag` chip linking to the document list filtered by the tag. */
export function TagChip({ tag, focusable = true }: { tag: string; focusable?: boolean }) {
  return (
    <Link
      to={tagHref(tag)}
      data-inline-tag={tag}
      aria-label={`태그 ${tag}`}
      tabIndex={focusable ? undefined : -1}
      onMouseDown={focusable ? undefined : keepFocus}
      className={TAG_CHIP_CLASS}
    >
      #{tag}
    </Link>
  );
}

function InlineLink({
  href,
  focusable,
  children,
}: {
  href: string | null;
  focusable: boolean;
  children: ReactNode;
}) {
  // A URL that failed the allowlist (`javascript:` …): its text, without a link.
  if (href === null) return <span data-unsafe-link="">{children}</span>;
  const shared = {
    tabIndex: focusable ? undefined : -1,
    onMouseDown: focusable ? undefined : keepFocus,
    className: linkClass,
  };
  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link to={href} {...shared}>
        {children}
      </Link>
    );
  }
  const external = /^(?:https?:)?\/\//i.test(href);
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      {...shared}
    >
      {children}
    </a>
  );
}

/** Inline nodes from `parseInlineMarkdown` as React elements (text stays text). */
export function InlineMarkdown({
  nodes,
  focusable = true,
}: {
  nodes: InlineNode[];
  focusable?: boolean;
}) {
  const render = (list: InlineNode[]): ReactNode =>
    list.map((node, index) => {
      switch (node.type) {
        case 'text':
          return (
            <span key={index} data-source-offset={node.from}>
              {node.text}
            </span>
          );
        case 'code':
          return (
            <code
              key={index}
              data-source-offset={node.from}
              className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
            >
              {node.text}
            </code>
          );
        case 'strong':
          return <strong key={index}>{render(node.children)}</strong>;
        case 'em':
          return <em key={index}>{render(node.children)}</em>;
        case 'strike':
          return (
            <del key={index} className="line-through">
              {render(node.children)}
            </del>
          );
        case 'link':
          return (
            <InlineLink key={index} href={node.href} focusable={focusable}>
              {node.children.length > 0 ? render(node.children) : node.href}
            </InlineLink>
          );
        case 'pageLink':
          return <PageLinkChip key={index} pageId={node.pageId} focusable={focusable} />;
        case 'tag':
          return <TagChip key={index} tag={node.tag} focusable={focusable} />;
        default:
          return null;
      }
    });
  return <>{render(nodes)}</>;
}

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

/** The block-text offset under a point of the preview, or null when it is not over text. */
function sourceOffsetAt(preview: HTMLElement, x: number, y: number): number | null {
  const doc = preview.ownerDocument as CaretDocument;
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    node = position?.offsetNode ?? null;
    offset = position?.offset ?? 0;
  } else if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    node = range?.startContainer ?? null;
    offset = range?.startOffset ?? 0;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const holder = node.parentElement?.closest(`[${SOURCE_OFFSET_ATTRIBUTE}]`);
  if (!holder || !preview.contains(holder)) return null;
  return Number(holder.getAttribute(SOURCE_OFFSET_ATTRIBUTE)) + offset;
}

interface Options {
  /** The block's current text (its controlled textarea value). */
  content: string;
  isFocused: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** Typography of the preview, matching the block's textarea. */
  className?: string;
}

/**
 * The live preview of one text block. Put `textareaStyle` on the textarea and render `element`
 * right after it.
 */
export function useInlinePreview({ content, isFocused, textareaRef, className }: Options) {
  // A focused block shows its source, so typing never pays for parsing.
  const nodes = useMemo(
    () => (isFocused ? null : parseInlineMarkdown(content)),
    [isFocused, content]
  );
  const previewing = nodes !== null && hasInlineMarkup(nodes, content);

  const edit = (event: MouseEvent<HTMLDivElement>) => {
    // A link or chip: let the click follow it. Anywhere else edits the block.
    if ((event.target as HTMLElement).closest('a[href]')) return;
    event.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;
    const length = textarea.value.length;
    const offset = sourceOffsetAt(event.currentTarget, event.clientX, event.clientY) ?? length;
    textarea.focus();
    textarea.setSelectionRange(Math.min(offset, length), Math.min(offset, length));
  };

  const element: ReactNode =
    previewing && nodes ? (
      <div
        data-inline-preview=""
        onMouseDown={edit}
        className={cn(
          'min-h-[1.625em] cursor-text whitespace-pre-wrap break-words text-foreground',
          className
        )}
      >
        <InlineMarkdown nodes={nodes} focusable={false} />
      </div>
    ) : null;

  return { previewing, textareaStyle: previewing ? VISUALLY_HIDDEN : undefined, element };
}
