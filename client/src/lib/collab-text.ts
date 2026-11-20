/**
 * Pieces of the shared-text binding that live between the Yjs document and a text input:
 *
 * - mapping a caret or selection through the delta of a change made elsewhere, so a collaborator's
 *   typing never moves the caret of the person typing in the same block;
 * - a registry through which the document binding tells the input of a block about such a change
 *   at the moment it happens (the input still shows the old text and the old selection then);
 * - a guard for IME composition (Korean, Japanese, Chinese input): while a composition is open in
 *   an input, changes from others wait, because writing a value into the input would end it.
 */

export type TextDelta = Array<{ retain?: number; insert?: unknown; delete?: number }>;

const lengthOf = (insert: unknown) => (typeof insert === 'string' ? insert.length : 1);

/**
 * Where `position` of the old text is in the text `delta` produces. `stickToInsert` decides about
 * text inserted exactly at `position`: true moves the position behind it, false keeps it in front.
 */
export function mapPosition(delta: TextDelta, position: number, stickToInsert = false): number {
  let cursor = 0; // index in the old text
  let shift = 0;
  for (const op of delta) {
    if (op.retain !== undefined) {
      cursor += op.retain;
    } else if (op.insert !== undefined) {
      if (cursor < position || (stickToInsert && cursor === position)) shift += lengthOf(op.insert);
    } else if (op.delete !== undefined) {
      shift -= Math.min(op.delete, Math.max(0, position - cursor));
      cursor += op.delete;
    }
    if (cursor > position && op.retain !== undefined) break;
  }
  return Math.max(0, position + shift);
}

/** The selection of an input after `delta`: a caret stays in front of text inserted at it. */
export function mapSelection(
  delta: TextDelta,
  start: number,
  end: number
): { start: number; end: number } {
  if (start === end) {
    const caret = mapPosition(delta, start, false);
    return { start: caret, end: caret };
  }
  return { start: mapPosition(delta, start, true), end: mapPosition(delta, end, false) };
}

/** Where the caret belongs after an undo or redo: behind the last text it inserted or removed. */
export function caretAfterDelta(delta: TextDelta): number | null {
  let position = 0;
  let caret: number | null = null;
  for (const op of delta) {
    if (op.retain !== undefined) {
      position += op.retain;
    } else if (op.insert !== undefined) {
      position += lengthOf(op.insert);
      caret = position;
    } else if (op.delete !== undefined) {
      caret = position;
    }
  }
  return caret;
}

export interface TextChange {
  blockId: string;
  delta: TextDelta;
  /** The text after the change. */
  text: string;
  /** Transaction origin: 'server' for a collaborator's change, anything else for undo and redo. */
  origin: unknown;
}

type TextChangeListener = (change: TextChange) => void;

const listeners = new Map<string, Set<TextChangeListener>>();

/** Registers an input's listener for the text changes of one block; returns its unsubscribe. */
export function onTextChange(blockId: string, listener: TextChangeListener): () => void {
  let set = listeners.get(blockId);
  if (!set) listeners.set(blockId, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(blockId);
  };
}

export function emitTextChange(change: TextChange): void {
  listeners.get(change.blockId)?.forEach((listener) => listener(change));
}

// ---- IME composition ------------------------------------------------------------------------

let composing: Element | null = null;
const compositionEndWaiters = new Set<() => void>();
let guardUsers = 0;

const inBlockRow = (target: EventTarget | null): target is Element =>
  target instanceof Element && target.closest('[data-block-row]') !== null;

function endComposition() {
  if (!composing) return;
  composing = null;
  // The last `input` of a composition can follow `compositionend`; let it land first.
  setTimeout(() => {
    if (!isComposing()) Array.from(compositionEndWaiters).forEach((waiter) => waiter());
  }, 0);
}

const onCompositionStart = (event: Event) => {
  if (inBlockRow(event.target)) composing = event.target;
};
const onCompositionEnd = () => endComposition();
const onFocusOut = (event: Event) => {
  if (composing && event.target === composing) endComposition();
};

/** Whether a block's input is in the middle of an IME composition. */
export function isComposing(): boolean {
  if (composing && (!composing.isConnected || document.activeElement !== composing)) {
    composing = null; // the input went away or lost focus: that ended the composition
  }
  return composing !== null;
}

/**
 * Starts tracking compositions (document-wide, capture phase) for as long as the returned stop
 * function has not been called; `whenDone` runs each time an open composition ends.
 */
export function watchComposition(whenDone: () => void): () => void {
  if (guardUsers++ === 0) {
    document.addEventListener('compositionstart', onCompositionStart, true);
    document.addEventListener('compositionend', onCompositionEnd, true);
    document.addEventListener('focusout', onFocusOut, true);
  }
  compositionEndWaiters.add(whenDone);
  return () => {
    compositionEndWaiters.delete(whenDone);
    if (--guardUsers === 0) {
      document.removeEventListener('compositionstart', onCompositionStart, true);
      document.removeEventListener('compositionend', onCompositionEnd, true);
      document.removeEventListener('focusout', onFocusOut, true);
      composing = null;
    }
  };
}
