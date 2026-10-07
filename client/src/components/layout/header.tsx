import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/use-theme';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/wiki/search-bar';
import { NotificationBell } from '@/components/ui/notification-bell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Moon, Sun, Settings, Menu, Search, ScrollText, LogOut } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useMemberByEmail } from '@/hooks/useMember';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';

interface HeaderProps {
  onToggleSidebar: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({ onToggleSidebar, searchQuery, onSearchChange }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const { flags } = useFeatureFlags();
  const enableNotifications = flags.FEATURE_NOTIFICATIONS && flags.FEATURE_TEAMS;
  const { data: member } = useMemberByEmail(user?.email, enableNotifications && !!user?.email);

  const handleLogout = () => {
    logout();
    navigate('/login');
    toast({
      title: 'Logged Out',
      description: 'You have been successfully logged out.',
    });
  };

  const getInitials = (name = '') => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex h-16 min-w-0 items-center gap-2 px-3 sm:px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={onToggleSidebar}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
              <ScrollText className="h-4 w-4 text-white" />
            </div>
            <h1 className="truncate text-base font-bold text-slate-900 sm:text-xl dark:text-white">
              Papyr.us
            </h1>
          </Link>
        </div>

        <div className="mx-2 hidden max-w-xl flex-1 md:block lg:mx-8">
          <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="Search documents" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:gap-1">
          <Button
            variant="ghost"
            size="mobile"
            className="size-10 md:hidden"
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            aria-label="Toggle search"
          >
            <Search className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="mobile"
            className="size-10 md:size-icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {isAuthenticated && user ? (
            <>
              {/* Use member.id for notifications (mapped from user.email) */}
              {enableNotifications ? <NotificationBell recipientId={member?.id} /> : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatarUrl} alt={user.name} />
                      <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
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
                        <span>Settings</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild>
              <Link to="/login">Login</Link>
            </Button>
          )}
        </div>
      </div>

      {showMobileSearch && (
        <div className="px-3 pb-4 md:hidden">
          <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="Search documents" />
        </div>
      )}
    </header>
  );
}
