import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  importFailureMessage,
  importVault,
  refreshPageListings,
  skipReasonLabel,
  type VaultImportSummary,
} from './vault-api';

interface VaultImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Team name of the workspace, or null for the team-less pages. */
  teamName: string | null;
  /** Workspace name shown to the user. */
  scopeLabel: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * "Markdown 가져오기" (#113 P2-D2): uploads an Obsidian vault (`.zip`) or Markdown files into the
 * current workspace, then shows what was created, skipped and left unlinked. The summary is a
 * polite live region; the page tree and document lists refresh after a successful import.
 */
export function VaultImportDialog({
  open,
  onOpenChange,
  teamName,
  scopeLabel,
}: VaultImportDialogProps) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<VaultImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFiles([]);
    setSummary(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async () => {
    if (files.length === 0 || pending) return;
    setPending(true);
    setError(null);
    setSummary(null);
    try {
      const result = await importVault(teamName, files);
      setSummary(result);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      if (result.created.length > 0) await refreshPageListings(queryClient);
    } catch (failure) {
      setError(importFailureMessage(failure));
    } finally {
      setPending(false);
    }
  };

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Markdown 가져오기</DialogTitle>
          <DialogDescription className="break-keep">
            Obsidian 보관함(.zip)이나 Markdown 파일(.md)을 {scopeLabel}에 문서로 가져옵니다. 폴더는
            상위 문서가 되고, [[링크]]는 문서 링크로 바뀝니다.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="text-sm font-medium text-foreground">
              가져올 파일
            </label>
            <Input
              id={inputId}
              ref={inputRef}
              type="file"
              accept=".zip,.md,.markdown"
              multiple
              disabled={pending}
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                setError(null);
              }}
              className="h-auto cursor-pointer py-1.5 file:mr-3 file:rounded-md file:bg-raised file:px-2.5 file:py-1 file:text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              {files.length > 0
                ? `파일 ${files.length}개 선택됨 · ${formatSize(totalSize)}`
                : '.zip 하나 또는 .md 파일 여러 개 · 최대 10MB'}
            </p>
            <p className="text-xs text-muted-foreground">
              링크의 별칭(|)은 가져오지 않고, 연결된 문서의 현재 제목으로 표시됩니다.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div role="status" aria-live="polite" className="space-y-2 text-sm">
            {pending && <p className="text-muted-foreground">가져오는 중…</p>}
            {summary && (
              <>
                <p className="font-semibold text-foreground">
                  {summary.created.length > 0
                    ? `문서 ${summary.created.length}개를 가져왔습니다.`
                    : '가져올 문서가 없습니다.'}
                </p>
                {summary.skipped.length > 0 && (
                  <div>
                    <p className="text-foreground-secondary">
                      건너뛴 파일 {summary.skipped.length}개
                    </p>
                    <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                      {summary.skipped.map((item) => (
                        <li key={`${item.path}:${item.reason}`} className="break-all">
                          {item.path} — {skipReasonLabel(item.reason)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.unresolvedLinkCount > 0 && (
                  <div>
                    <p className="text-foreground-secondary">
                      연결하지 못한 링크 {summary.unresolvedLinkCount}개 (일반 텍스트로 남김)
                    </p>
                    <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                      {summary.unresolvedLinks.map((link) => (
                        <li key={`${link.path}:${link.target}`} className="break-all">
                          {link.path}: [[{link.target}]]
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              {summary ? '닫기' : '취소'}
            </Button>
            <Button type="submit" disabled={files.length === 0 || pending} aria-busy={pending}>
              {pending ? '가져오는 중…' : '가져오기'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
