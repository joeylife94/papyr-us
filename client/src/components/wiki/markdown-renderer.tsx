import { useEffect, useState } from "react";
import { markdownToHtml } from "@/lib/markdown";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let isCancelled = false;

    markdownToHtml(content).then((htmlContent) => {
      if (!isCancelled) {
        setHtml(htmlContent);
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
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`prose prose-slate dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
