import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpenDailyNote } from '@/hooks/useDailyNote';

interface DailyNoteButtonProps {
  className?: string;
  /** Called after the note opened (closes the mobile drawer). */
  onNavigate?: () => void;
}

/** Quiet "오늘의 노트" button for the workspace panel header (#111). */
export function DailyNoteButton({ className, onNavigate }: DailyNoteButtonProps) {
  const { openDailyNote, pending, ready } = useOpenDailyNote();
  return (
    <button
      type="button"
      onClick={async () => {
        await openDailyNote();
        onNavigate?.();
      }}
      disabled={pending || !ready}
      aria-busy={pending || undefined}
      aria-label="오늘의 노트"
      title="오늘의 노트 (Alt+Shift+D)"
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className
      )}
    >
      <CalendarDays className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
