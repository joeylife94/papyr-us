import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { History, RotateCcw, Clock, User, Info } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/wiki/markdown-renderer';
import { useToast } from '@/hooks/use-toast';
import { describeVersion } from '@/lib/version-history';
import { cn } from '@/lib/utils';

interface PageVersion {
  id: number;
  pageId: number;
  title: string;
  content?: string;
  blocks?: any[];
  author: string;
  versionNumber: number;
  changeDescription: string | null;
  createdAt: string;
}

interface PageHistoryProps {
  pageId: number;
  currentTitle: string;
  /** When the page was last saved, shown on the "현재 문서" marker. */
  currentUpdatedAt?: string | Date;
  /** Called after a restore so an open editor can reload the restored page. */
  onRestored?: (page: { slug?: string }) => void;
}

const relative = (date: string | Date) =>
  formatDistanceToNow(new Date(date), { addSuffix: true, locale: ko });

/** What a restore does, said the same way on the page and in the confirmation (restoreVersion). */
const restoreExplanation = (versionNumber: number) =>
  `복원하면 지금 내용이 ‘복원 전’ 버전으로 먼저 남고, 문서가 v${versionNumber} 내용으로 바뀝니다. 기존 기록은 지워지지 않습니다.`;

/**
 * Version history (issue #101 P6): the versions on the left with the current document marked,
 * the selected version's preview on the right, and a deliberate restore behind an AlertDialog.
 * Restore semantics are unchanged: the server keeps the current state as a new version first.
 */
export function PageHistory({
  pageId,
  currentTitle,
  currentUpdatedAt,
  onRestored,
}: PageHistoryProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: versions = [],
    isLoading,
    refetch: refetchVersions,
  } = useQuery<PageVersion[]>({
    queryKey: [`/api/pages/${pageId}/versions`],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}/versions`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Keep a version selected: the newest one, until the user picks another (or it disappears).
  useEffect(() => {
    if (versions.length === 0) return setSelectedId(null);
    if (selectedId === null || !versions.some((v) => v.id === selectedId)) {
      setSelectedId(versions[0].id);
    }
  }, [versions, selectedId]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;

  const preview = useQuery<PageVersion>({
    queryKey: [`/api/pages/${pageId}/versions/${selectedId}`],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}/versions/${selectedId}`);
      if (!res.ok) throw new Error('Failed to fetch version');
      return res.json();
    },
    enabled: selectedId !== null,
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: number) => {
      const res = await fetch(`/api/pages/${pageId}/versions/${versionId}/restore`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to restore version');
      return res.json();
    },
    onSuccess: (restoredPage: { slug?: string }, versionId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/pages/${pageId}`] });
      // The open reader view loads by slug and never goes stale on its own.
      if (restoredPage?.slug) {
        queryClient.invalidateQueries({ queryKey: [`/api/pages/slug/${restoredPage.slug}`] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      // The restore kept the pre-restore state as a new version; show it at the top.
      queryClient.invalidateQueries({ queryKey: [`/api/pages/${pageId}/versions`] });
      setSelectedId(null);
      onRestored?.(restoredPage);
      const restored = versions.find((v) => v.id === versionId);
      toast({
        title: '버전 복원 완료',
        description: restored
          ? `v${restored.versionNumber} 내용으로 복원했습니다. 이전 내용은 ‘복원 전’ 버전으로 남았습니다.`
          : '선택한 버전으로 복원했습니다.',
      });
    },
    onError: () => {
      toast({
        title: '복원 실패',
        description: '버전 복원에 실패했습니다. 다시 시도해주세요.',
        variant: 'destructive',
      });
    },
  });

  return (
    <>
      {/* Autosave can add versions while the page is open, so reload the list on every open. */}
      <Sheet onOpenChange={(open) => open && void refetchVersions()}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <History className="h-4 w-4" />
            버전 기록
            {versions.length > 0 && (
              <Badge variant="secondary" className="ml-1 font-mono text-xs">
                {versions.length}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
          <SheetHeader className="space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" aria-hidden="true" />
              버전 기록
            </SheetTitle>
            <SheetDescription className="truncate">{currentTitle}</SheetDescription>
            <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              자동 저장은 버전을 만들지 않습니다. 편집을 시작하기 전과 복원하기 전의 내용이 버전으로
              남습니다.
            </p>
          </SheetHeader>

          {isLoading ? (
            <div className="flex h-32 items-center justify-center" aria-busy="true">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] md:grid-cols-[17rem_1fr] md:grid-rows-1">
              {/* Versions, newest first, under the current document. */}
              <nav
                aria-label="버전 목록"
                className="max-h-[38vh] overflow-y-auto border-b border-border p-2 md:max-h-none md:border-b-0 md:border-r"
              >
                <ol className="space-y-1">
                  <li
                    aria-current="true"
                    className="rounded-lg border border-success/40 bg-success/10 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">현재 문서</span>
                      <Badge
                        variant="outline"
                        className="border-success/40 text-[11px] font-normal text-success"
                      >
                        지금
                      </Badge>
                    </div>
                    {currentUpdatedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {relative(currentUpdatedAt)} 저장
                      </p>
                    )}
                  </li>
                  {versions.map((version) => {
                    const kind = describeVersion(version.changeDescription);
                    const isSelected = version.id === selectedId;
                    return (
                      <li key={version.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(version.id)}
                          aria-pressed={isSelected}
                          data-version-number={version.versionNumber}
                          className={cn(
                            'flex min-h-11 w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isSelected
                              ? 'border-highlight/60 bg-highlight/10'
                              : 'border-transparent hover:bg-raised'
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              v{version.versionNumber}
                            </span>
                            <span className="truncate text-sm font-medium text-foreground">
                              {version.title}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {kind && (
                              <span className="text-foreground-secondary">{kind.label}</span>
                            )}
                            <span>{relative(version.createdAt)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {versions.length === 0 && (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">아직 버전이 없습니다</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      편집을 시작하면 그 직전 내용이 첫 버전으로 남습니다.
                    </p>
                  </div>
                )}
              </nav>

              {/* The selected version and how to restore it. */}
              <section aria-label="버전 미리보기" className="min-h-0 overflow-y-auto p-5">
                {!selected ? (
                  <p className="text-sm text-muted-foreground">
                    {versions.length === 0
                      ? '버전이 생기면 여기에서 내용을 확인할 수 있습니다.'
                      : '버전을 선택하세요.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    <header className="space-y-1.5">
                      <p className="font-mono text-xs text-muted-foreground">
                        v{selected.versionNumber}
                        {describeVersion(selected.changeDescription) &&
                          ` · ${describeVersion(selected.changeDescription)!.label}`}
                      </p>
                      <h3 className="break-words text-xl font-bold text-foreground">
                        {selected.title}
                      </h3>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" aria-hidden="true" />
                          {selected.author}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          <time dateTime={new Date(selected.createdAt).toISOString()}>
                            {format(new Date(selected.createdAt), 'yyyy-MM-dd HH:mm')}
                          </time>
                          <span>({relative(selected.createdAt)})</span>
                        </span>
                      </p>
                    </header>

                    <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
                      <p className="text-xs leading-relaxed text-foreground-secondary">
                        {restoreExplanation(selected.versionNumber)}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 gap-2 border-warning/60 text-foreground hover:bg-warning/10"
                        onClick={() => setConfirmOpen(true)}
                        disabled={restoreMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 text-warning" aria-hidden="true" />이 버전으로
                        복원
                      </Button>
                    </div>

                    <div
                      data-testid="version-preview"
                      className="min-w-0 border-t border-border pt-4"
                    >
                      {preview.isLoading ? (
                        <div className="h-24 animate-pulse rounded bg-raised" />
                      ) : preview.data ? (
                        preview.data.content?.trim() ? (
                          <MarkdownRenderer content={preview.data.content} className="prose-sm" />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            이 버전에는 본문이 없습니다.
                          </p>
                        )
                      ) : (
                        <p className="text-sm text-muted-foreground">버전을 불러올 수 없습니다.</p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Restore stays deliberate: a confirmation that says what will happen. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected ? `v${selected.versionNumber}으로 복원할까요?` : '이 버전으로 복원할까요?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected ? restoreExplanation(selected.versionNumber) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={() => selected && restoreMutation.mutate(selected.id)}
            >
              복원
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
