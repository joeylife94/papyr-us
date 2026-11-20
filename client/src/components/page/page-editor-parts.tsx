import { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { readPageCover, type PageCover } from '@shared/schema';
import type { AutosaveStatus, PageField, PageWithRevision } from '@/hooks/usePageAutosave';

interface PageTitleProps {
  /** Initial text. Editable titles are uncontrolled afterwards so typing never loses the caret. */
  initialTitle: string;
  editable: boolean;
  onChange?: (title: string) => void;
  /** Enter moves on to the body instead of inserting a line break. */
  onEnter?: () => void;
  placeholder?: string;
  /**
   * Replace the text shown by `text` each time `token` changes (the title was changed elsewhere
   * and the editor takes it over). The field keeps its place and focus.
   */
  replaceWith?: { token: number; text: string };
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
  replaceWith,
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

  // Only a replacement made after this field mounted applies; one already in place when it
  // remounts (the title shown is then `initialTitle`) is not applied again.
  const seenToken = useRef(replaceWith?.token);
  useEffect(() => {
    if (!replaceWith || replaceWith.token === seenToken.current) return;
    seenToken.current = replaceWith.token;
    if (ref.current) ref.current.textContent = replaceWith.text;
  }, [replaceWith?.token]);

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
              ? '저장되지 않음 · 다른 곳에서 바뀜'
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

/** What the editor shows for the fields a conflict can be about (the "mine" side). */
export interface ConflictMine {
  title: string;
  /** The body as text. */
  content: string;
  folder: string;
  tags: string;
  icon: string | null;
  cover: PageCover | null;
}

interface SaveConflictNoticeProps {
  /** The fields being written here that also changed in the stored page. */
  fields: PageField[];
  mine: ConflictMine;
  /** The page as it is stored now. */
  theirs: PageWithRevision;
  onLoadLatest: () => void;
  onKeepMine: () => void;
}

const FIELD_LABEL: Record<PageField, string> = {
  title: '제목',
  blocks: '본문',
  tags: '태그',
  folder: '폴더',
  icon: '아이콘',
  cover: '커버',
};

const coverLabel = (cover: PageCover | null) =>
  !cover ? '없음' : cover.type === 'image' ? '업로드한 이미지' : `기본 커버 (${cover.id})`;

function versionsOf(field: PageField, mine: ConflictMine, theirs: PageWithRevision) {
  switch (field) {
    case 'title':
      return [mine.title, theirs.title];
    case 'blocks':
      return [mine.content, theirs.content];
    case 'tags':
      return [mine.tags, (theirs.tags ?? []).join(', ')];
    case 'folder':
      return [mine.folder, theirs.folder];
    case 'icon':
      return [mine.icon ?? '없음', theirs.icon ?? '없음'];
    case 'cover':
      return [coverLabel(mine.cover), coverLabel(readPageCover(theirs.metadata))];
  }
}

/**
 * Shown when a save was refused because the page was changed elsewhere (another person, the same
 * person's other tab or window, an automation) in something this editor is also writing (WP1).
 * Autosave is paused. For each field that collides both versions are shown, so keeping mine and
 * loading the latest are choices between two things the person can read. Neither button is the
 * default: one replaces the other person's change, the other drops this editor's.
 *
 * Only the title and body of whatever is not saved are kept in the version history.
 */
export function SaveConflictNotice({
  fields,
  mine,
  theirs,
  onLoadLatest,
  onKeepMine,
}: SaveConflictNoticeProps) {
  return (
    <section
      role="alert"
      data-testid="page-save-conflict"
      aria-labelledby="page-save-conflict-title"
      className="break-keep rounded-lg border border-warning/60 bg-warning/10 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <h2 id="page-save-conflict-title" className="text-sm font-semibold text-foreground">
              이 문서가 다른 곳에서 수정되었습니다
            </h2>
            <p className="text-[13px] leading-relaxed text-foreground-secondary">
              {fields.length > 0
                ? '다른 사람, 내 다른 탭이나 창, 자동화 등 다른 곳에서 문서가 바뀌었고 내가 고친 부분과 겹쳐 저장하지 않았습니다. 자동 저장은 멈췄고, 아래에서 어느 쪽을 쓸지 고를 수 있습니다.'
                : '다른 사람, 내 다른 탭이나 창, 자동화 등 다른 곳에서 문서가 바뀌어 저장하지 않았습니다. 자동 저장은 멈췄고, 어느 쪽을 쓸지 고를 수 있습니다. 내가 고친 부분이 바뀐 부분과 겹치는지는 알 수 없습니다.'}
            </p>
          </div>
          {fields.map((field) => {
            const [mineText, theirText] = versionsOf(field, mine, theirs);
            return (
              <div key={field} className="space-y-2">
                <h3 className="text-[13px] font-medium text-foreground">
                  겹친 부분: {FIELD_LABEL[field]}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['mine', '내 버전', mineText],
                    ['theirs', '저장된 버전 (읽기 전용)', theirText],
                  ].map(([side, label, text]) => (
                    <div key={side} className="min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <div
                        data-testid={`page-save-conflict-${side}-${field}`}
                        className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground"
                      >
                        {text || '(비어 있음)'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            버전 기록에는 제목과 본문만 남습니다. 태그, 폴더, 아이콘, 커버는 남지 않으므로 필요하면
            지금 적어 두세요.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Button type="button" variant="outline" size="sm" onClick={onLoadLatest}>
                최신 내용 불러오기
              </Button>
              <p className="text-xs text-muted-foreground">
                저장된 최신 문서를 보여 주고, 내가 고친 내용은 버립니다. 내가 쓴 제목과 본문은 버전
                기록에 남습니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <Button type="button" variant="outline" size="sm" onClick={onKeepMine}>
                내 변경 유지
              </Button>
              <p className="text-xs text-muted-foreground">
                겹친 부분을 내 내용으로 저장해 저장된 버전을 덮어씁니다. 덮어쓴 제목과 본문은 버전
                기록에 남습니다.
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
