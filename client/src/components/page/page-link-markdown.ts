import type { Element, ElementContent, Root, RootContent } from 'hast';
import { splitPageLinks } from '../../../../shared/page-links';

/** Attribute of the empty placeholder the reader mounts a link chip into (#103 E6). */
export const PAGE_LINK_SLOT_ATTRIBUTE = 'data-page-link-slot';

const RAW_TEXT_PARENTS = new Set(['code', 'pre', 'script', 'style']);

function slotsFor(text: string): ElementContent[] {
  return splitPageLinks(text).map((segment) =>
    segment.type === 'text'
      ? { type: 'text', value: segment.text }
      : {
          type: 'element',
          tagName: 'span',
          properties: { dataPageLinkSlot: String(segment.pageId) },
          children: [],
        }
  );
}

function transform(node: Root | Element) {
  if (node.type === 'element' && RAW_TEXT_PARENTS.has(node.tagName)) return;
  const children: Array<RootContent | ElementContent> = [];
  let changed = false;
  for (const child of node.children) {
    if (child.type === 'text' && child.value.includes('[[page:')) {
      const replaced = slotsFor(child.value);
      changed ||= replaced.length !== 1 || replaced[0].type !== 'text';
      children.push(...replaced);
    } else {
      if (child.type === 'element') transform(child);
      children.push(child);
    }
  }
  if (changed) node.children = children as typeof node.children;
}

/**
 * Rehype plugin: link tokens (`[[page:<id>]]`) in rendered text become empty placeholders that
 * carry only the id; MarkdownRenderer mounts a `PageLinkChip` into each one. Code keeps the raw
 * token. No title is ever written into the HTML, so it never outlives an access change.
 */
export function rehypePageLinkSlots() {
  return (tree: Root) => {
    transform(tree);
  };
}
