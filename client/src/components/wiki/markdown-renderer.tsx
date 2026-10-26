import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { markdownToHtml } from '@/lib/markdown';
import { INLINE_TAG_ATTRIBUTE } from '@/lib/rehype-inline-tags';
import { PageLinkChip } from '@/components/page/page-link-chip';
import { PAGE_LINK_SLOT_ATTRIBUTE } from '@/components/page/page-link-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  // Page link placeholders in the rendered HTML; each gets a chip (#103 E6).
  const [linkSlots, setLinkSlots] = useState<HTMLElement[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let isCancelled = false;

    markdownToHtml(content)
      .then((htmlContent) => {
        if (!isCancelled) {
          setHtml(htmlContent);
        }
      })
      .catch((err) => {
        console.warn('Failed to render markdown:', err);
        if (!isCancelled) {
          // Fall back to plain text display (escaped: page content is untrusted input)
          setHtml(`<pre>${escapeHtml(content)}</pre>`);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [content]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    setLinkSlots(
      root ? Array.from(root.querySelectorAll<HTMLElement>(`[${PAGE_LINK_SLOT_ATTRIBUTE}]`)) : []
    );
  }, [html]);

  // `#tag` links (#113) are plain anchors in the HTML; open them in the app, not by a reload.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const openTag = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest(`a[${INLINE_TAG_ATTRIBUTE}]`);
      const href = link?.getAttribute('href');
      if (!link || !href || !root.contains(link)) return;
      event.preventDefault();
      navigate(href);
    };
    root.addEventListener('click', openTag);
    return () => root.removeEventListener('click', openTag);
  }, [html, navigate]);

  if (!html) {
    return (
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-3/4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
            <div className="h-4 bg-muted rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`prose prose-slate dark:prose-invert max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {linkSlots.map((slot, index) =>
        createPortal(
          <PageLinkChip pageId={Number(slot.getAttribute(PAGE_LINK_SLOT_ATTRIBUTE))} />,
          slot,
          `${index}:${slot.getAttribute(PAGE_LINK_SLOT_ATTRIBUTE)}`
        )
      )}
    </>
  );
}
