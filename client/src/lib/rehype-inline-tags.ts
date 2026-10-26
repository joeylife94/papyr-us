import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
// Relative import: unit tests load this module without the Vite aliases.
import { isTagBoundary, readTagName, TAG_CHIP_CLASS, tagHref } from './inline-markdown';

/** Attribute naming the tag of a reader tag link; MarkdownRenderer routes clicks on it. */
export const INLINE_TAG_ATTRIBUTE = 'data-inline-tag';

const SKIPPED_PARENTS = new Set(['a', 'code', 'pre', 'script', 'style']);

interface HashOrigin {
  /** Written as `#` (not `\#` or a character reference such as `&#35;`). */
  literal: boolean;
  /** The source character before it; undefined at the start of the document. */
  previous: string | undefined;
}

/**
 * Where each `#` of a text node came from in the Markdown source. Text node values are decoded
 * (`\#` and `&#35;` both read `#`), so the source tells an escaped `#` from a real one, and the
 * character before it (`**#tag**`, `[x](y)#tag`) the same way the editor preview sees it.
 * Null when the node has no source position or the source does not line up with it.
 */
function hashOrigins(node: Text, source: string | null): HashOrigin[] | null {
  const from = node.position?.start.offset;
  const to = node.position?.end.offset;
  if (source === null || from === undefined || to === undefined) return null;
  const origins: HashOrigin[] = [];
  for (let index = from; index < to; index++) {
    const char = source[index];
    if (char === '\\' && /[!-/:-@[-`{-~]/.test(source[index + 1] ?? '')) {
      if (source[index + 1] === '#') origins.push({ literal: false, previous: undefined });
      index++;
    } else if (char === '&') {
      const reference =
        /^&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/.exec(
          source.slice(index, index + 40)
        );
      if (!reference) continue;
      const [text, decimal, hex, name] = reference;
      const code = decimal ? Number(decimal) : hex ? parseInt(hex, 16) : null;
      if (code === 35 || name === 'num') origins.push({ literal: false, previous: undefined });
      index += text.length - 1;
    } else if (char === '#') {
      origins.push({ literal: true, previous: index > 0 ? source[index - 1] : undefined });
    }
  }
  const hashes = node.value.split('#').length - 1;
  return origins.length === hashes ? origins : null;
}

function tagLink(tag: string): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: {
      href: tagHref(tag),
      className: TAG_CHIP_CLASS.split(' '),
      ariaLabel: `태그 ${tag}`,
      dataInlineTag: tag,
    },
    children: [{ type: 'text', value: `#${tag}` }],
  };
}

/** The text node split around its tags, or null when it has none. */
function splitTags(node: Text, source: string | null): ElementContent[] | null {
  const { value } = node;
  const origins = hashOrigins(node, source);
  const parts: ElementContent[] = [];
  let last = 0;
  let hash = -1;
  for (let index = value.indexOf('#'); index >= 0; index = value.indexOf('#', index + 1)) {
    hash++;
    const origin = origins?.[hash];
    if (origin && !origin.literal) continue;
    const previous = origin ? origin.previous : index > 0 ? value[index - 1] : undefined;
    if (!isTagBoundary(previous)) continue;
    const tag = readTagName(value, index);
    if (!tag) continue;
    if (index > last) parts.push({ type: 'text', value: value.slice(last, index) });
    parts.push(tagLink(tag));
    last = index + 1 + tag.length;
  }
  if (parts.length === 0) return null;
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
  return parts;
}

function transform(node: Root | Element, source: string | null) {
  if (node.type === 'element' && SKIPPED_PARENTS.has(node.tagName)) return;
  const children: Array<RootContent | ElementContent> = [];
  let changed = false;
  for (const child of node.children) {
    const split =
      child.type === 'text' && child.value.includes('#') ? splitTags(child, source) : null;
    if (split) {
      for (const part of split) children.push(part); // no spread: text can hold many tags
      changed = true;
    } else {
      if (child.type === 'element') transform(child, source);
      children.push(child);
    }
  }
  if (changed) node.children = children as typeof node.children;
}

/**
 * Rehype plugin: `#tag` in rendered text becomes a link to the tag's document list (#113 §2),
 * with the same rules as the editor preview (`inline-markdown.ts`): Unicode letters, digits,
 * `_`, `-` and `/` with at least one letter, not inside a word, not escaped. Code, existing links
 * and raw-text elements keep the text as written. Run it before `rehypePageLinkSlots` (it reads
 * source positions those placeholders do not carry) and before `rehypeSafeUrls`.
 */
export function rehypeInlineTags() {
  return (tree: Root, file: { value?: unknown }) => {
    transform(tree, typeof file?.value === 'string' ? file.value : null);
  };
}
