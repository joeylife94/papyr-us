import type { BlockType } from '@shared/schema';

/**
 * Markdown shortcuts in paragraph blocks (#111 §6): typing one of these prefixes at the very
 * start of a paragraph converts the block. Each prefix ends with the character that triggers
 * the conversion (a space, the third backtick for code, the third dash for a divider). A divider
 * has no text, so `---` converts only an otherwise empty paragraph (#113 §1).
 */
export const MARKDOWN_SHORTCUTS: ReadonlyArray<{ prefix: string; type: BlockType }> = [
  { prefix: '# ', type: 'heading1' },
  { prefix: '## ', type: 'heading2' },
  { prefix: '### ', type: 'heading3' },
  { prefix: '- ', type: 'bulleted_list' },
  { prefix: '* ', type: 'bulleted_list' },
  { prefix: '1. ', type: 'numbered_list' },
  { prefix: '[] ', type: 'checkbox' },
  { prefix: '[ ] ', type: 'checkbox' },
  { prefix: '> ', type: 'quote' },
  { prefix: '```', type: 'code' },
  { prefix: '---', type: 'divider' },
];

export interface MarkdownShortcutMatch {
  type: BlockType;
  /** The literal prefix that was typed, e.g. `"## "`. */
  prefix: string;
  /** The converted block's content: whatever followed the caret. */
  content: string;
}

/**
 * The conversion an input in a paragraph triggers, or null. It matches only when the input
 * typed exactly one character, that character completes a prefix, and the caret sits right
 * after that prefix at the very start of the block. Deleting, pasting, or typing elsewhere in
 * the block never converts it.
 *
 * @param previous the paragraph's text before the input
 * @param next the text after it
 * @param caret the caret position after the input (`selectionStart`)
 */
export function matchMarkdownShortcut(
  previous: string,
  next: string,
  caret: number
): MarkdownShortcutMatch | null {
  if (next.length !== previous.length + 1 || caret < 1 || caret > next.length) return null;
  // One character inserted just before the caret, everything else unchanged.
  if (next.slice(0, caret - 1) + next.slice(caret) !== previous) return null;
  const typed = next.slice(0, caret);
  const shortcut = MARKDOWN_SHORTCUTS.find(({ prefix }) => prefix === typed);
  if (!shortcut) return null;
  const content = next.slice(caret);
  if (shortcut.type === 'divider' && content !== '') return null;
  return { type: shortcut.type, prefix: shortcut.prefix, content };
}
