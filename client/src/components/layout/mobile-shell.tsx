import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MoreHorizontal, ScrollText, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchBar } from '@/components/wiki/search-bar';
import { useShellNav } from './shell-nav';
import { AccountMenu, ShellNotifications, ThemeToggle } from './shell-controls';
import { WorkspacePanel } from './workspace-panel';

interface MobileShellProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

/**
 * Phone and tablet shell: a top bar, a bottom tab bar with the primary sections, and the
 * workspace panel in a drawer ("더보기").
 */
export function MobileShell({ searchQuery, onSearchChange }: MobileShellProps) {
  const { pathname } = useLocation();
  const { scope, primary } = useShellNav();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const workspaceName = scope.kind === 'team' ? scope.workspace.displayName : 'Papyr.us';

  const drawerRef = useRef<HTMLElement>(null);

  // Any navigation closes the drawer.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // A closed drawer stays off-screen; `inert` keeps its links out of the tab order
  // (React 18 has no `inert` prop, so set the attribute directly).
  useEffect(() => {
    drawerRef.current?.toggleAttribute('inert', !drawerOpen);
  }, [drawerOpen]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-panel">
        <div className="flex h-14 items-center gap-1 pl-2 pr-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-[15px] font-bold text-foreground"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
            >
              <ScrollText className="h-3.5 w-3.5" />
            </span>
            <span className="sr-only">메뉴 열기: </span>
            <span className="truncate">{workspaceName}</span>
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            aria-label={searchOpen ? '검색 닫기' : '검색 열기'}
            aria-expanded={searchOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-raised hover:text-foreground"
          >
            <Search className="h-5 w-5" />
          </button>
          <ShellNotifications />
          <AccountMenu side="bottom" align="end" />
        </div>
        {searchOpen && (
          <div className="px-4 pb-3">
            <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="문서 검색" />
          </div>
        )}
      </header>

      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 grid h-16 border-t border-border bg-panel px-1 pb-1"
        style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
      >
        {primary.map((item) => (
          <Link
            key={item.key}
            to={item.href}
            aria-current={item.current ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-[11px]',
              item.active ? 'font-bold text-highlight' : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          className="flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          더보기
        </button>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setDrawerOpen(false)} />
      )}
      <aside
        ref={drawerRef}
        aria-label="워크스페이스 패널"
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm overflow-y-auto border-r border-border bg-panel transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-3 pt-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="메뉴 닫기"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-raised hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <WorkspacePanel
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onNavigate={() => setDrawerOpen(false)}
          showTools
        />
      </aside>
    </>
  );
}
