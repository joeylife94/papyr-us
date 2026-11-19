import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { caretAfterDelta, mapSelection, onTextChange } from '@/lib/collab-text';

type TextField = HTMLTextAreaElement | HTMLInputElement;

/**
 * Keeps the caret and selection of a focused input in place when the text of its block changes
 * because of someone else (or an undo): they are carried through the change (see
 * lib/collab-text.ts) instead of jumping to the end when the new value is written. `value` is the
 * text the input shows. Does nothing for the person's own typing.
 */
export function useRemoteCaret(
  blockId: string | undefined,
  fieldRef: RefObject<TextField | null>,
  value: string
): void {
  const pending = useRef<{ text: string; start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    if (!blockId) return;
    return onTextChange(blockId, (change) => {
      const field = fieldRef.current;
      if (!field || document.activeElement !== field) return;
      const start = field.selectionStart ?? 0;
      const end = field.selectionEnd ?? start;
      const caret = change.origin === 'server' ? null : caretAfterDelta(change.delta);
      const mapped = caret === null ? mapSelection(change.delta, start, end) : null;
      pending.current = {
        text: change.text,
        start: mapped ? mapped.start : caret!,
        end: mapped ? mapped.end : caret!,
      };
    });
  }, [blockId, fieldRef]);

  useLayoutEffect(() => {
    const selection = pending.current;
    if (!selection) return;
    pending.current = null;
    const field = fieldRef.current;
    if (field && document.activeElement === field && field.value === selection.text) {
      field.setSelectionRange(selection.start, selection.end);
    }
  }, [value, fieldRef]);
}

/**
 * The text of a block as its input shows it. The input edits a local copy, and the block's own
 * text (`blockContent`, which follows the shared document) is copied back whenever it differs, so
 * what a collaborator typed shows up (with the caret kept, see `useRemoteCaret`).
 *
 * The copy is a layout effect, not a passive one: it is in place before the browser can deliver
 * another keystroke, so an edit is always computed against the text the person saw.
 */
export function useSyncedText(
  blockId: string,
  blockContent: string,
  fieldRef: RefObject<TextField | null>
): [string, (next: string) => void] {
  const [content, setContent] = useState(blockContent);

  useLayoutEffect(() => {
    if (blockContent !== content) setContent(blockContent);
    // Only the block's text drives this; `content` follows local typing on its own.
  }, [blockContent]);

  useRemoteCaret(blockId, fieldRef, content);
  return [content, setContent];
}
