import { Link } from 'react-router-dom';
import { MoreHorizontal, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useShellNav } from './shell-nav';
import { AccountMenu, ShellNotifications, ThemeToggle } from './shell-controls';

const railButton =
  'flex h-11 w-11 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Desktop icon rail: brand, primary sections, secondary tools, and account controls. */
export function AppRail() {
  const { primary, tools } = useShellNav();

  return (
    <div className="fixed inset-y-0 left-0 z-40 flex w-[60px] flex-col items-center gap-1.5 border-r border-border bg-rail py-4">
      <Link
        to="/"
        className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
      >
        <ScrollText className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Papyr.us</span>
      </Link>

      <nav aria-label="주요 메뉴" className="flex flex-col items-center gap-1.5">
        {primary.map((item) => (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>
              <Link
                to={item.href}
                aria-label={item.label}
                aria-current={item.current ? 'page' : undefined}
                className={cn(
                  railButton,
                  item.active
                    ? 'bg-raised text-highlight'
                    : 'text-muted-foreground hover:bg-raised hover:text-foreground'
                )}
              >
                <item.icon className="h-[19px] w-[19px]" aria-hidden="true" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="기타 도구"
              title="기타 도구"
              className={cn(
                railButton,
                'text-muted-foreground hover:bg-raised hover:text-foreground'
              )}
            >
              <MoreHorizontal className="h-[19px] w-[19px]" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-56">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              기타 도구
            </DropdownMenuLabel>
            {tools.map((tool) => (
              <DropdownMenuItem key={tool.key} asChild>
                <Link to={tool.href}>
                  <tool.icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {tool.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <ThemeToggle />
        <ShellNotifications />
        <AccountMenu side="right" align="end" />
      </div>
    </div>
  );
}
