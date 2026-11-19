import { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AutosaveStatus } from '@/hooks/usePageAutosave';

interface PageTitleProps {
  /** Initial text. Editable titles are uncontrolled afterwards so typing never loses the caret. */
  initialTitle: string;
  editable: boolean;
  onChange?: (title: string) => void;
  /** Enter moves on to the body instead of inserting a line break. */
  onEnter?: () => void;
  placeholder?: string;
}

/**
 * The page title, edited in place. It stays a real level-1 heading (its accessible name is the
 * title text), so reading and editing share one element.
 */
export function PageTitle({
  initialTitle,
  editable,
  onChange,
  onEnter,
  placeholder = '제목 없음',
}: PageTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  // While editing, the DOM owns the text after mount, so React never re-renders it (re-rendering a
  // contentEditable child would fight the caret). Read-only titles follow the page being shown.
  const followedTitle = editable ? null : initialTitle;

  useEffect(() => {
    if (ref.current && ref.current.textContent !== initialTitle) {
      ref.current.textContent = initialTitle;
    }
  }, [followedTitle]);

  return (
    <h1
      ref={ref}
      data-testid="page-title"
      data-placeholder={placeholder}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck={editable}
      onInput={(e) => onChange?.((e.currentTarget.textContent ?? '').replace(/\s+/g, ' ').trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter?.();
        }
      }}
      onPaste={(e) => {
        // Titles are plain text on one line.
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain').replace(/\s+/g, ' ');
        document.execCommand('insertText', false, text);
      }}
      className={cn(
        'break-words break-keep text-3xl font-extrabold tracking-tight text-foreground outline-none sm:text-4xl',
        editable &&
          'rounded-md empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] focus-visible:ring-0'
      )}
    />
  );
}

export function SaveStatus({ status }: { status: AutosaveStatus }) {
  const label =
    status === 'saving'
      ? '저장 중…'
      : status === 'pending'
        ? '저장 대기 중'
        : status === 'saved'
          ? '저장됨'
          : status === 'error'
            ? '저장 실패 · 다시 시도 중'
            : status === 'conflict'
              ? '저장되지 않음 · 문서가 바뀜'
              : '';
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 font-mono text-xs',
        status === 'error' || status === 'conflict' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {status === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {status === 'saved' && <Check className="h-3.5 w-3.5 text-highlight" aria-hidden="true" />}
      {(status === 'error' || status === 'conflict') && (
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

interface SaveConflictNoticeProps {
  /** What this editor holds and has not been able to save, shown before it can be dropped. */
  title: string;
  content: string;
  folder: string;
  tags: string;
  onLoadLatest: () => void;
  onKeepMine: () => void;
}

/**
 * Shown when a save was refused because someone else changed the page after this editor loaded
 * it (WP1). Autosave is paused; the person chooses between the other person's text and their own,
 * and both stay in the version history either way.
 */
export function SaveConflictNotice({
  title,
  content,
  folder,
  tags,
  onLoadLatest,
  onKeepMine,
}: SaveConflictNoticeProps) {
  return (
    <section
      role="alert"
      data-testid="page-save-conflict"
      aria-labelledby="page-save-conflict-title"
      className="rounded-lg border border-warning/60 bg-warning/10 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <h2 id="page-save-conflict-title" className="text-sm font-semibold text-foreground">
              다른 사람이 이 문서를 수정했습니다
            </h2>
            <p className="text-[13px] leading-relaxed text-foreground-secondary">
              내가 고친 내용은 아직 저장되지 않았고 자동 저장은 멈췄습니다. 어느 쪽을 고르더라도 두
              내용 모두 버전 기록에 남아 있어 나중에 되돌릴 수 있습니다.
            </p>
          </div>
          <details open className="group">
            <summary className="cursor-pointer text-[13px] font-medium text-foreground">
              내가 쓴 내용 보기
            </summary>
            <div
              data-testid="page-save-conflict-mine"
              className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground"
            >
              {[title, content].filter(Boolean).join('\n\n')}
              {(folder || tags) && (
                <span className="mt-2 block text-muted-foreground">
                  {[folder && `폴더: ${folder}`, tags && `태그: ${tags}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          </details>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Button type="button" variant="outline" size="sm" onClick={onLoadLatest}>
                최신 내용 불러오기
              </Button>
              <p className="text-xs text-muted-foreground">
                다른 사람이 저장한 내용을 보여 주고, 내가 고친 내용은 버립니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <Button type="button" size="sm" onClick={onKeepMine}>
                내 변경 유지
              </Button>
              <p className="text-xs text-muted-foreground">
                내 내용으로 다시 저장해 다른 사람의 변경을 덮어씁니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface PropertiesProps {
  folder: string;
  folders: string[];
  tags: string;
  author: string;
  onFolderChange: (folder: string) => void;
  onTagsChange: (tags: string) => void;
  onAuthorChange?: (author: string) => void;
}

const fieldLabel = 'font-mono text-[11.5px] text-muted-foreground';
const fieldInput =
  'h-8 rounded-md border border-border bg-card px-2 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Folder, tags and author in one compact row under the title. */
export function PageProperties({
  folder,
  folders,
  tags,
  author,
  onFolderChange,
  onTagsChange,
  onAuthorChange,
}: PropertiesProps) {
  const folderOptions = folders.includes(folder) ? folders : [folder, ...folders];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-4">
      <label className="flex items-center gap-2">
        <span className={fieldLabel}>폴더</span>
        <select
          value={folder}
          onChange={(e) => onFolderChange(e.target.value)}
          className={fieldInput}
        >
          {folderOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className={fieldLabel}>태그</span>
        <input
          type="text"
          value={tags}
          onChange={(e) => onTagsChange(e.target.value)}
          placeholder="쉼표로 구분"
          className={cn(fieldInput, 'min-w-[8rem] flex-1')}
        />
      </label>
      {onAuthorChange && (
        <label className="flex items-center gap-2">
          <span className={fieldLabel}>작성자</span>
          <input
            type="text"
            value={author}
            onChange={(e) => onAuthorChange(e.target.value)}
            className={cn(fieldInput, 'w-32')}
          />
        </label>
      )}
    </div>
  );
}
