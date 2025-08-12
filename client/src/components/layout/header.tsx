import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/use-theme";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/wiki/search-bar";
import { NotificationBell } from "@/components/ui/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Moon, Sun, Settings, Menu, Search, ScrollText, LogOut, User as UserIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

  const handleLogout = () => {
    logout();
    navigate('/login');
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
  };

  const getInitials = (name = '') => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  return (
    <header className="fixed top-0 left-0 right-0 bg-gradient-to-r from-white/90 via-white/95 to-slate-50/90 dark:from-slate-900/90 dark:via-slate-900/95 dark:to-slate-950/90 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-700/60 z-40 shadow-sm">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex items-center justify-between px-4 h-16">
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onToggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity cursor-pointer">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <ScrollText className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Papyr.us</h1>
          </Link>
        </div>

        <div className="flex-1 max-w-md mx-8 hidden md:block">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search documentation..."
          />
        </div>

        <div className="flex items-center space-x-2 md:space-x-1">
          <Button
            variant="ghost"
            size="mobile"
            className="md:hidden"
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            aria-label="Toggle search"
          >
            <Search className="h-5 w-5" />
          </Button>
          
          <Button
            variant="ghost"
            size="mobile"
            className="md:size-icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {isAuthenticated && user ? (
            <>
              <NotificationBell userId={user.id} />
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
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/admin')}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
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
        <div className="md:hidden px-4 pb-4">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search documentation..."
          />
        </div>
      )}
    </header>
  );
}
