import { useEffect, useRef } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutosaveStatus } from '@/hooks/usePageAutosave';

interface PageTitleProps {
  /** Initial text; the element is uncontrolled afterwards so typing never loses the caret. */
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

  useEffect(() => {
    if (ref.current && ref.current.textContent !== initialTitle) {
      ref.current.textContent = initialTitle;
    }
    // Only on mount / remount: afterwards the DOM owns the text, so React never re-renders it
    // (re-rendering a contentEditable child would fight the caret).
  }, []);

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
            : '';
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 font-mono text-xs',
        status === 'error' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {status === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {status === 'saved' && <Check className="h-3.5 w-3.5 text-highlight" aria-hidden="true" />}
      {status === 'error' && <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </span>
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
