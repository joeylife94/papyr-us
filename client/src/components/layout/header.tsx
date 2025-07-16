import { useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/wiki/search-bar";
import { NotificationBell } from "@/components/ui/notification-bell";
import { Moon, Sun, Settings, Menu, Search, ScrollText } from "lucide-react";

interface HeaderProps {
  onToggleSidebar: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({ onToggleSidebar, searchQuery, onSearchChange }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 bg-gradient-to-r from-white/90 via-white/95 to-slate-50/90 dark:from-slate-900/90 dark:via-slate-900/95 dark:to-slate-950/90 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-700/60 z-40 shadow-sm">
      {/* Skip to main content link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex items-center justify-between px-4 h-16">
        {/* Logo and Title */}
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onToggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/papyr-us/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity cursor-pointer">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <ScrollText className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Papyr.us</h1>
          </Link>
        </div>

        {/* Desktop Search Bar */}
        <div className="flex-1 max-w-md mx-8 hidden md:block">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search documentation..."
          />
        </div>

        {/* Actions */}
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
          <NotificationBell userId={1} />
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
          <Link href="/papyr-us/admin">
            <Button
              variant="ghost"
              size="mobile"
              className="md:size-icon"
              title="Admin Settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Mobile Search */}
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
