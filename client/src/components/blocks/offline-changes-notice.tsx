import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OfflineChanges } from '@/hooks/useYjsCollaboration';

interface OfflineChangesNoticeProps {
  changes: OfflineChanges;
  onDismiss: () => void;
}

/**
 * Shown when edits made while the connection was down could not be applied, because the server
 * rebuilt the page's shared document in the meantime. The text of every block that was added or
 * changed stays here, selectable and copyable, until the person dismisses the notice.
 */
export function OfflineChangesNotice({ changes, onDismiss }: OfflineChangesNoticeProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      // Clipboard access can be refused; the text stays selectable in the box.
    }
  };

  return (
    <div
      role="alert"
      data-testid="offline-changes-notice"
      className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium">
            연결이 끊긴 동안 한 편집을 적용하지 못했습니다. 문서가 서버에서 다시 만들어져 지금은
            서버의 내용이 표시됩니다.
          </p>
          {changes.removed > 0 && (
            <p className="text-muted-foreground">
              삭제한 블록 {changes.removed}개도 적용되지 않았습니다.
            </p>
          )}
          {changes.blocks.length > 0 && (
            <p className="text-muted-foreground">
              아래는 편집했던 블록의 내용입니다. 필요하면 복사해서 다시 붙여넣으세요.
            </p>
          )}
          {changes.blocks.map((block) => (
            <div key={block.id} className="space-y-1">
              <textarea
                readOnly
                aria-label={`적용되지 않은 편집 (${block.type})`}
                data-testid="offline-change-text"
                value={block.text}
                rows={Math.min(8, Math.max(2, block.text.split('\n').length))}
                className="w-full resize-none rounded border bg-background p-2 text-sm"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(block.id, block.text)}
              >
                {copied === block.id ? '복사됨' : '복사'}
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          닫기
        </Button>
      </div>
    </div>
  );
}
