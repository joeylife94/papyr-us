import { describe, expect, it } from 'vitest';
import type { Block } from '../../shared/schema';
import { planPageEmbedInsertion } from '../../client/src/lib/page-embed-insert';

// Inserting a page embed in the editor (#135). The embed block names the embedded page; the
// legacy Socket.IO event names the page being edited, which is the page the editor joined:
// the server refuses a change for any other page (NOT_JOINED), so collaborators would never
// see the insertion.

const paragraph = (id: string, content: string, order: number): Block => ({
  id,
  type: 'paragraph',
  content,
  properties: {},
  order,
  children: [],
});

const EDITED_PAGE = 41;
const EMBEDDED_PAGE = 7;

describe('planPageEmbedInsertion', () => {
  it('turns the empty block into the embed; the event names the edited page', () => {
    const blocks = [paragraph('a', 'Intro', 0), paragraph('b', '/페이지', 1)];
    const plan = planPageEmbedInsertion({
      blocks,
      blockId: 'b',
      text: '',
      targetPageId: EMBEDDED_PAGE,
      pageId: EDITED_PAGE,
      stamp: 's',
    })!;
    expect(plan.replace).toBe(true);
    expect(plan.index).toBe(1);
    expect(plan.embed).toEqual({
      id: 'b',
      type: 'page_embed',
      content: '',
      properties: { pageId: EMBEDDED_PAGE },
      order: 1,
      children: [],
    });
    expect(plan.blocks).toEqual([blocks[0], plan.embed]);
    expect(plan.change).toEqual({
      pageId: EDITED_PAGE,
      blockId: 'b',
      type: 'update',
      data: { blocks: plan.blocks },
    });
  });

  it('keeps the text and inserts the embed below it, renumbering the blocks', () => {
    const blocks = [paragraph('a', 'Intro ![[', 0), paragraph('c', 'End', 1)];
    const plan = planPageEmbedInsertion({
      blocks,
      blockId: 'a',
      text: 'Intro ',
      targetPageId: EMBEDDED_PAGE,
      pageId: EDITED_PAGE,
      stamp: 's',
    })!;
    expect(plan.replace).toBe(false);
    expect(plan.blocks.map((b) => [b.id, b.type, b.content, b.order])).toEqual([
      ['a', 'paragraph', 'Intro ', 0],
      ['block_s_embed', 'page_embed', '', 1],
      ['c', 'paragraph', 'End', 2],
    ]);
    expect(plan.embed.properties).toEqual({ pageId: EMBEDDED_PAGE });
    expect(plan.change?.pageId).toBe(EDITED_PAGE);
    expect(plan.change?.type).toBe('insert');
    expect(plan.change?.blockId).toBe('block_s_embed');
    // The caller's blocks are not changed in place.
    expect(blocks[0].content).toBe('Intro ![[');
  });

  it('sends no event without an edited page, and plans nothing for a block that is gone', () => {
    const blocks = [paragraph('a', '', 0)];
    const base = { blocks, text: '', targetPageId: EMBEDDED_PAGE, stamp: 's' };
    expect(planPageEmbedInsertion({ ...base, blockId: 'a' })?.change).toBeNull();
    expect(planPageEmbedInsertion({ ...base, blockId: 'gone', pageId: EDITED_PAGE })).toBeNull();
  });
});
