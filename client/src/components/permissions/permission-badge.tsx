import { Shield, Eye, MessageSquare, Edit, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type PermissionLevel = 'owner' | 'editor' | 'viewer' | 'commenter' | null;

interface PermissionBadgeProps {
  permission: PermissionLevel;
  className?: string;
  showIcon?: boolean;
  showLabel?: boolean;
}

export function PermissionBadge({
  permission,
  className = '',
  showIcon = true,
  showLabel = true,
}: PermissionBadgeProps) {
  if (!permission) {
    return null;
  }

  const config = getPermissionConfig(permission);

  return (
    <Badge variant={config.variant as any} className={`gap-1.5 ${className}`}>
      {showIcon && config.icon}
      {showLabel && config.label}
    </Badge>
  );
}

function getPermissionConfig(permission: PermissionLevel) {
  switch (permission) {
    case 'owner':
      return {
        icon: <Crown className="h-3 w-3" />,
        label: 'Owner',
        variant: 'default',
        description: 'Full control - can manage permissions and delete',
      };
    case 'editor':
      return {
        icon: <Edit className="h-3 w-3" />,
        label: 'Editor',
        variant: 'secondary',
        description: 'Can view and edit content',
      };
    case 'commenter':
      return {
        icon: <MessageSquare className="h-3 w-3" />,
        label: 'Commenter',
        variant: 'outline',
        description: 'Can view and add comments',
      };
    case 'viewer':
      return {
        icon: <Eye className="h-3 w-3" />,
        label: 'Viewer',
        variant: 'outline',
        description: 'Can view only',
      };
    default:
      return {
        icon: <Shield className="h-3 w-3" />,
        label: 'Unknown',
        variant: 'outline',
        description: 'Unknown permission level',
      };
  }
}

interface ReadOnlyBannerProps {
  permission: PermissionLevel;
  pageTitle: string;
}

export function ReadOnlyBanner({ permission, pageTitle }: ReadOnlyBannerProps) {
  // Only show banner for viewer or commenter
  if (permission === 'owner' || permission === 'editor' || !permission) {
    return null;
  }

  const config = getPermissionConfig(permission);

  return (
    <div className="bg-muted border-l-4 border-primary p-4 mb-4 rounded-r-lg">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold text-sm">Read-only access</p>
          <p className="text-sm text-muted-foreground">
            You have <strong>{config.label.toLowerCase()}</strong> permission for "{pageTitle}".
            {permission === 'commenter' && ' You can add comments but cannot edit content.'}
            {permission === 'viewer' && ' Contact the page owner for edit access.'}
          </p>
        </div>
      </div>
    </div>
  );
}

interface PermissionIndicatorProps {
  permission: PermissionLevel;
  isPublicLink?: boolean;
}

export function PermissionIndicator({
  permission,
  isPublicLink = false,
}: PermissionIndicatorProps) {
  if (!permission) {
    return null;
  }

  const config = getPermissionConfig(permission);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {config.icon}
      <span>
        {isPublicLink && '🔗 Shared link • '}
        {config.description}
      </span>
    </div>
  );
}
