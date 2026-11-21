import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import {
  activeMentionQuery,
  labelFor,
  type MentionQuery,
  type PickedMention,
} from '@/lib/mention-draft';
import { MENTION_SEARCH_MIN_LENGTH } from '@shared/comment-mentions';

interface Candidate {
  id: number;
  name: string;
}

interface MentionTextareaProps {
  pageId: number;
  value: string;
  picked: PickedMention[];
  onChange: (value: string, picked: PickedMention[]) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
}

/**
 * A comment box where typing `@` and a name (two characters at least) offers the people who can
 * read the page. Picking one inserts `@Name`; the text becomes a mention token only on sending.
 * Names are shown as text; the list comes from the server, which offers only readers of the page.
 */
export function MentionTextarea({
  pageId,
  value,
  picked,
  onChange,
  placeholder,
  className,
  testId,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = useState<MentionQuery | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [highlight, setHighlight] = useState(0);

  const query = active?.query.trim() ?? '';
  useEffect(() => {
    if ([...query].length < MENTION_SEARCH_MIN_LENGTH) {
      setCandidates([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/pages/${pageId}/mention-candidates?q=${encodeURIComponent(query)}`,
          { credentials: 'include', signal: controller.signal }
        );
        if (!response.ok) {
          setCandidates([]);
          return;
        }
        const body = (await response.json()) as { candidates?: Candidate[] };
        setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
        setHighlight(0);
      } catch {
        // aborted or failed: no list
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pageId, query]);

  const open = active !== null && candidates.length > 0;

  const choose = (candidate: Candidate) => {
    if (!active) return;
    const label = labelFor(candidate, picked);
    const caret = active.start + 1 + active.query.length;
    const inserted = `@${label} `;
    const next = value.slice(0, active.start) + inserted + value.slice(caret);
    const nextPicked = picked.some((entry) => entry.id === candidate.id && entry.label === label)
      ? picked
      : [...picked, { id: candidate.id, label }];
    onChange(next, nextPicked);
    setActive(null);
    setCandidates([]);
    const position = active.start + inserted.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(position, position);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        data-testid={testId}
        placeholder={placeholder}
        value={value}
        className={className}
        onChange={(event) => {
          onChange(event.target.value, picked);
          setActive(activeMentionQuery(event.target.value, event.target.selectionStart));
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlight((index) => (index + 1) % candidates.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((index) => (index - 1 + candidates.length) % candidates.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            choose(candidates[highlight]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setActive(null);
          }
        }}
        onBlur={() => setTimeout(() => setActive(null), 150)}
      />
      {open && (
        <ul
          role="listbox"
          aria-label="Mention someone"
          data-testid="mention-listbox"
          className="absolute left-0 z-50 mt-1 max-h-60 w-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {candidates.map((candidate, index) => (
            <li
              key={candidate.id}
              role="option"
              aria-selected={index === highlight}
              data-testid="mention-option"
              className={`cursor-pointer rounded-sm px-2 py-1.5 text-sm ${
                index === highlight ? 'bg-accent text-accent-foreground' : ''
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(candidate);
              }}
            >
              {candidate.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
