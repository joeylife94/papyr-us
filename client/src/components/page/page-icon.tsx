import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageIconProps {
  /** The page's emoji (`wiki_pages.icon`, #103 E4), or null/undefined for none. */
  icon?: string | null;
  className?: string;
  /** Show the default document glyph when the page has no icon. */
  fallback?: boolean;
}

/**
 * A page's icon wherever the page appears (tree, table, breadcrumb, links, graph). Decorative:
 * the page title beside it is the accessible name.
 */
export function PageIcon({ icon, className, fallback = true }: PageIconProps) {
  if (icon) {
    return (
      <span
        aria-hidden="true"
        className={cn('inline-flex shrink-0 items-center justify-center leading-none', className)}
      >
        {icon}
      </span>
    );
  }
  if (!fallback) return null;
  return (
    <FileText aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0 opacity-60', className)} />
  );
}
