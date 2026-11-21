import { Crown, Edit, Eye, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LEVEL_BADGE_LABELS, LEVEL_DESCRIPTIONS, type PageLevel } from './permission-labels';

const ICONS: Record<PageLevel, JSX.Element> = {
  owner: <Crown className="h-3 w-3" aria-hidden="true" />,
  editor: <Edit className="h-3 w-3" aria-hidden="true" />,
  commenter: <MessageSquare className="h-3 w-3" aria-hidden="true" />,
  viewer: <Eye className="h-3 w-3" aria-hidden="true" />,
};

interface PermissionBadgeProps {
  /** The caller's own level on the page; nothing is shown without one. */
  permission: PageLevel | null | undefined;
  className?: string;
}

/** The caller's own level on the page, in the page header. */
export function PermissionBadge({ permission, className = '' }: PermissionBadgeProps) {
  if (!permission) return null;
  return (
    <Badge
      variant={permission === 'owner' ? 'default' : 'outline'}
      className={`gap-1.5 whitespace-nowrap ${className}`}
      title={LEVEL_DESCRIPTIONS[permission]}
      data-testid="page-permission-badge"
      data-permission={permission}
    >
      {ICONS[permission]}
      {LEVEL_BADGE_LABELS[permission]}
    </Badge>
  );
}
