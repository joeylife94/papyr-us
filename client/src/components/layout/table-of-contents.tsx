import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { List, Download, Printer, History } from 'lucide-react';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  headings: Heading[];
  className?: string;
}

export function TableOfContents({ headings, className }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-20% 0px -80% 0px',
        threshold: 0,
      }
    );

    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  if (headings.length === 0) return null;

  return (
    <aside className={cn('hidden xl:block w-64 ml-8', className)}>
      <div className="sticky top-24 p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
          <List className="h-4 w-4 text-primary mr-2" />
          On This Page
        </h3>
        <nav className="space-y-2">
          {headings.map(({ id, text, level }) => (
            <button
              key={id}
              onClick={() => scrollToHeading(id)}
              className={cn(
                'block text-sm py-1 border-l-2 transition-colors text-left w-full',
                level === 1 && 'pl-3',
                level === 2 && 'pl-3',
                level === 3 && 'pl-6',
                level >= 4 && 'pl-9',
                activeId === id
                  ? 'text-primary border-primary font-medium'
                  : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-primary hover:border-primary'
              )}
            >
              {text}
            </button>
          ))}
        </nav>

        {/* Quick Actions */}
        <div className="mt-8 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
            Quick Actions
          </h4>
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-auto p-1 text-sm"
              onClick={() => window.print()}
            >
              <Download className="h-3 w-3 mr-2" />
              Export as PDF
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-auto p-1 text-sm"
              onClick={() => window.print()}
            >
              <Printer className="h-3 w-3 mr-2" />
              Print Page
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start h-auto p-1 text-sm">
              <History className="h-3 w-3 mr-2" />
              View History
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
