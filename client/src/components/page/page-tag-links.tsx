import { Link } from 'react-router-dom';
import { useTagScopePath } from '@/hooks/useTagScopePath';
import { TAG_CHIP_CLASS, tagHref } from '@/lib/inline-markdown';
import { cn } from '@/lib/utils';

/**
 * A page's `tags` field as links to the tag pane of the page's workspace, each tag selected
 * (#137). Tag text renders as text and is URL-encoded in the link.
 */
export function PageTagLinks({ tags, className }: { tags: string[]; className?: string }) {
  const scopePath = useTagScopePath();
  const distinct = Array.from(new Set(tags));
  if (distinct.length === 0) return null;
  return (
    <ul aria-label="문서 태그" className={cn('flex min-w-0 flex-wrap gap-1.5', className)}>
      {distinct.map((tag) => (
        <li key={tag} className="min-w-0">
          <Link
            to={tagHref(tag, scopePath)}
            aria-label={`태그 ${tag}`}
            data-page-tag={tag}
            className={cn(TAG_CHIP_CLASS, 'max-w-full truncate text-[13px]')}
          >
            #{tag}
          </Link>
        </li>
      ))}
    </ul>
  );
}
