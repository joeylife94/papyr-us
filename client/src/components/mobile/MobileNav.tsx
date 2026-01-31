/**
 * Mobile Navigation Component
 * 
 * Responsive navigation with hamburger menu for mobile
 * and full navigation for desktop
 */

import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useBreakpoint, useMobileNav, useSwipe } from '@/hooks/use-responsive';
import { 
  Menu, 
  X, 
  Home, 
  FileText, 
  Users, 
  Calendar, 
  Settings, 
  Search,
  Bell,
  Plus,
  ChevronLeft
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: <Home className="w-5 h-5" /> },
  { label: 'Pages', href: '/pages', icon: <FileText className="w-5 h-5" /> },
  { label: 'Teams', href: '/teams', icon: <Users className="w-5 h-5" /> },
  { label: 'Calendar', href: '/calendar', icon: <Calendar className="w-5 h-5" /> },
];

interface MobileNavProps {
  className?: string;
}

/**
 * Mobile Header with hamburger menu
 */
export function MobileHeader({ className }: MobileNavProps) {
  const [location] = useLocation();
  const { isOpen, toggle, close } = useMobileNav();
  const { isMobile } = useBreakpoint();
  const [notificationCount] = useState(3); // Example

  // Swipe to close
  const swipeHandlers = useSwipe(
    undefined,
    () => isOpen && close() // Swipe right to close
  );

  if (!isMobile) return null;

  return (
    <>
      {/* Fixed Header */}
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-30 bg-background border-b',
          'h-14 flex items-center px-4 gap-4',
          'safe-area-top', // For notched phones
          className
        )}
      >
        {/* Menu Button */}
        <button
          onClick={toggle}
          className="p-2 -ml-2 rounded-lg active:bg-muted"
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Title / Logo */}
        <Link href="/" className="flex-1">
          <span className="text-lg font-bold">Papyr.us</span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg active:bg-muted">
            <Search className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-lg active:bg-muted relative">
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Slide-out Navigation Drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50"
          onClick={close}
        />

        {/* Drawer */}
        <nav
          className={cn(
            'absolute top-0 left-0 bottom-0 w-72 bg-background',
            'transform transition-transform duration-300 ease-out',
            'flex flex-col safe-area-top safe-area-bottom',
            isOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          {...swipeHandlers}
        >
          {/* Drawer Header */}
          <div className="h-14 flex items-center px-4 border-b">
            <span className="text-lg font-bold flex-1">Menu</span>
            <button
              onClick={close}
              className="p-2 -mr-2 rounded-lg active:bg-muted"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav Items */}
          <div className="flex-1 overflow-y-auto py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
              >
                <a
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors',
                    location === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'active:bg-muted'
                  )}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-2 py-0.5 text-xs bg-muted rounded-full">
                      {item.badge}
                    </span>
                  )}
                </a>
              </Link>
            ))}
          </div>

          {/* Drawer Footer */}
          <div className="border-t p-4">
            <Link href="/settings" onClick={close}>
              <a className="flex items-center gap-3 px-4 py-3 rounded-lg active:bg-muted">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </a>
            </Link>
          </div>
        </nav>
      </div>

      {/* Spacer for fixed header */}
      <div className="h-14" />
    </>
  );
}

/**
 * Mobile Bottom Tab Bar
 */
export function MobileTabBar({ className }: MobileNavProps) {
  const [location] = useLocation();
  const { isMobile } = useBreakpoint();

  if (!isMobile) return null;

  const tabs = [
    { label: 'Home', href: '/', icon: <Home className="w-5 h-5" /> },
    { label: 'Pages', href: '/pages', icon: <FileText className="w-5 h-5" /> },
    { label: 'New', href: '/pages/new', icon: <Plus className="w-6 h-6" />, isAction: true },
    { label: 'Teams', href: '/teams', icon: <Users className="w-5 h-5" /> },
    { label: 'More', href: '/settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* Spacer */}
      <div className="h-16" />

      {/* Tab Bar */}
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-30',
          'bg-background border-t',
          'flex items-center justify-around',
          'h-16 safe-area-bottom',
          className
        )}
      >
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href}>
            <a
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2',
                'transition-colors',
                tab.isAction && 'relative -mt-4',
                location === tab.href
                  ? 'text-primary'
                  : 'text-muted-foreground active:text-foreground'
              )}
            >
              {tab.isAction ? (
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                  {tab.icon}
                </div>
              ) : (
                <>
                  {tab.icon}
                  <span className="text-xs">{tab.label}</span>
                </>
              )}
            </a>
          </Link>
        ))}
      </nav>
    </>
  );
}

/**
 * Page Header for inner pages (with back button)
 */
interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, onBack, actions, className }: PageHeaderProps) {
  const { isMobile } = useBreakpoint();
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      setLocation('/');
    }
  };

  if (!isMobile) return null;

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-30 bg-background border-b',
          'h-14 flex items-center px-2',
          'safe-area-top',
          className
        )}
      >
        <button
          onClick={handleBack}
          className="p-2 rounded-lg active:bg-muted"
          aria-label="Go back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <h1 className="flex-1 text-lg font-semibold truncate px-2">
          {title}
        </h1>

        {actions && (
          <div className="flex items-center gap-1">
            {actions}
          </div>
        )}
      </header>

      {/* Spacer */}
      <div className="h-14" />
    </>
  );
}

export default {
  MobileHeader,
  MobileTabBar,
  PageHeader,
};
