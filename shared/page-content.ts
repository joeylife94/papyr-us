/**
 * The Markdown `content` of a block list, used by the server's save pipeline
 * (server/services/page-save.ts) and by the editor (client/src/lib/page-content.ts), so both
 * derive the same text.
 *
 * Block types become their Markdown form: headings, checkbox and list items, quotes and fenced
 * code. The read-only view, the version preview and the table of contents render this text, and
 * search and AI read it. Paragraphs and other blocks keep their text as written, so a content-only
 * page seeded as one paragraph of Markdown stays the same. Blocks are joined by blank lines.
 */

type BlockLike = { type?: unknown; content?: unknown; properties?: unknown };

const HEADING_PREFIX: Record<string, string> = { heading1: '#', heading2: '##', heading3: '###' };

/** Indent every line after the first so a multi-line item stays inside its list item. */
const continueLines = (text: string, indent: string) => text.split('\n').join(`\n${indent}`);

function blockToMarkdown(block: BlockLike): string {
  const text = typeof block.content === 'string' ? block.content : '';
  const type = typeof block.type === 'string' ? block.type : '';
  const properties =
    block.properties && typeof block.properties === 'object'
      ? (block.properties as Record<string, unknown>)
      : {};
  if (!text.trim()) return type === 'code' || type in HEADING_PREFIX ? '' : text;

  if (type in HEADING_PREFIX) {
    const line = text.replace(/\s*\n\s*/g, ' ').trim();
    // Text that already carries Markdown heading marks is kept as typed.
    return /^#{1,6}\s/.test(line) ? line : `${HEADING_PREFIX[type]} ${line}`;
  }
  switch (type) {
    case 'checkbox':
      return `- [${properties.checked === true ? 'x' : ' '}] ${continueLines(text, '  ')}`;
    case 'bulleted_list':
      return `- ${continueLines(text, '  ')}`;
    case 'numbered_list':
      return `1. ${continueLines(text, '   ')}`;
    case 'quote':
      return text
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'code': {
      const language = typeof properties.language === 'string' ? properties.language : '';
      // A fence longer than any backtick run inside the code. Counted in one pass: spreading
      // every run into Math.max overflows the call stack on code with very many runs.
      let longest = 2;
      let run = 0;
      for (const char of text) {
        run = char === '`' ? run + 1 : 0;
        if (run > longest) longest = run;
      }
      const fence = '`'.repeat(longest + 1);
      return `${fence}${language}\n${text}\n${fence}`;
    }
    default:
      return text;
  }
}

export function blocksToMarkdown(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((block) => (block && typeof block === 'object' ? blockToMarkdown(block as BlockLike) : ''))
    .join('\n\n');
}
