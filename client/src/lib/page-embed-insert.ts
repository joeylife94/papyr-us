import type { Block } from '@shared/schema';

/** The legacy Socket.IO collaboration event for a change to the page being edited. */
export interface BlockDocumentChange {
  /** The page being edited (the one the editor joined), never the embedded page. */
  pageId: number;
  blockId: string;
  type: 'insert' | 'update';
  data: { blocks: Block[] };
}

export interface PageEmbedInsertion {
  /** Where the block that asked for the embed sits. */
  index: number;
  /** Whether that block (empty once the "![[" or "/…" is gone) becomes the embed. */
  replace: boolean;
  /** The embed block: only the target's id, in `properties.pageId`. */
  embed: Block;
  /** The page's blocks after the insertion, renumbered. */
  blocks: Block[];
  /** The event for collaborators on the legacy channel; null without a page id. */
  change: BlockDocumentChange | null;
}

/**
 * Embedding `targetPageId` from the block `blockId` of the page `pageId` (#135): `text` (the
 * block's text without what asked for the embed) stays in the block and the embed goes below
 * it, or the empty block becomes the embed. Null when the block is gone. `stamp` makes the new
 * block's id unique.
 */
export function planPageEmbedInsertion(input: {
  blocks: Block[];
  blockId: string;
  text: string;
  targetPageId: number;
  pageId?: number;
  stamp: string;
}): PageEmbedInsertion | null {
  const { blocks, blockId, text, targetPageId, pageId, stamp } = input;
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index === -1) return null;
  const replace = text.trim() === '';
  const embed: Block = {
    id: replace ? blockId : `block_${stamp}_embed`,
    type: 'page_embed',
    content: '',
    properties: { pageId: targetPageId },
    order: 0,
    children: [],
  };
  const next = [...blocks];
  if (replace) {
    next[index] = { ...next[index], ...embed };
  } else {
    next[index] = { ...next[index], content: text };
    next.splice(index + 1, 0, embed);
  }
  const ordered = next.map((block, order) => (block.order === order ? block : { ...block, order }));
  const placed = ordered[replace ? index : index + 1];
  return {
    index,
    replace,
    embed: placed,
    blocks: ordered,
    change: pageId
      ? {
          pageId,
          blockId: placed.id,
          type: replace ? 'update' : 'insert',
          data: { blocks: ordered },
        }
      : null,
  };
}
