import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Moon, Settings, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/use-theme';
import { toast } from '@/hooks/use-toast';
import { useMemberByEmail } from '@/hooks/useMember';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/ui/notification-bell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const iconButton =
  'flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-raised hover:text-foreground';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className={cn(iconButton, className)}
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

/** Notification bell for members of a team workspace; renders nothing when the feature is off. */
export function ShellNotifications() {
  const { user } = useAuth();
  const { flags } = useFeatureFlags();
  const enabled = flags.FEATURE_NOTIFICATIONS && flags.FEATURE_TEAMS;
  // Notifications are addressed to the member record mapped from the user's email.
  const { data: member } = useMemberByEmail(user?.email, enabled && !!user?.email);
  return enabled ? <NotificationBell recipientId={member?.id} /> : null;
}

function initials(name = '') {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function AccountMenu({
  side = 'bottom',
  align = 'end',
}: {
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'end';
}) {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const { flags } = useFeatureFlags();

  if (!isAuthenticated || !user) {
    return (
      <Button asChild size="sm">
        <Link to="/login">로그인</Link>
      </Button>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
    toast({ title: '로그아웃했습니다', description: '다시 로그인하면 이어서 작업할 수 있습니다.' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="계정 메뉴"
          data-testid="user-menu"
          className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity hover:opacity-80"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatarUrl} alt="" />
            <AvatarFallback className="bg-raised text-xs font-semibold text-foreground">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align={align} side={side} forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {flags.FEATURE_ADMIN ? (
          <>
            <DropdownMenuItem onClick={() => navigate('/admin')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>설정</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>로그아웃</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
