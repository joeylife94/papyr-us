import { useEffect, useState } from 'react';
import { markdownToHtml } from '@/lib/markdown';
import { PageLinkPortals } from '@/components/page/page-links';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const [html, setHtml] = useState('');
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

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
          // Fall back to plain text display
          setHtml(`<pre>${content}</pre>`);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [content]);

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
        ref={setRoot}
        className={`prose prose-slate dark:prose-invert max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {/* Page links (issue #103 E6) render as chips inside their placeholders. */}
      <PageLinkPortals root={root} html={html} />
    </>
  );
}
