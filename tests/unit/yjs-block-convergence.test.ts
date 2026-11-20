/**
 * Realtime editing converges (WP5): the shared shape of a page's blocks, with two or three
 * in-memory documents.
 *
 * "Concurrent" here means both documents were edited before either saw the other's update: the
 * updates are encoded first and only then exchanged (`exchange`). Edits made one after the other
 * cannot show what these tests are about.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { Block } from '../../shared/schema';
import { blockTypes } from '../../shared/schema';
import { markdownToBlocks } from '../../shared/block-markdown';
import {
  blockMaps,
  blockOrder,
  changesSince,
  createUndoManager,
  deleteBlock,
  diffText,
  insertBlock,
  moveBlock,
  readBlocks,
  seedBlocks,
  updateBlock,
} from '../../shared/yjs-blocks';

const block = (id: string, content = '', extra: Partial<Block> = {}): Block =>
  ({ id, type: 'paragraph', content, properties: {}, order: 0, children: [], ...extra }) as Block;

/** Every document applies the updates every document had *before* any of them was applied. */
function exchange(...docs: Y.Doc[]) {
  const updates = docs.map((doc) => Y.encodeStateAsUpdate(doc));
  for (const doc of docs) for (const update of updates) Y.applyUpdate(doc, update);
}

/** `count` replicas of a document seeded with `blocks` (the server's document, then clients). */
function replicas(blocks: Block[], count = 2): Y.Doc[] {
  const server = new Y.Doc();
  seedBlocks(server, blocks);
  const docs = [server];
  for (let i = 1; i < count; i++) {
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    docs.push(client);
  }
  return docs;
}

const ids = (doc: Y.Doc) => readBlocks(doc).map((b) => b.id);
const find = (doc: Y.Doc, id: string) => readBlocks(doc).find((b) => b.id === id);
const withoutOrder = (b: Block) => {
  const { order, ...rest } = b;
  void order;
  return rest;
};

/** Whether `typed` appears in `text` as a subsequence, in order. */
function containsInOrder(text: string, typed: string) {
  let at = 0;
  for (const char of text) if (char === typed[at]) at++;
  return at === typed.length;
}

describe('concurrent edits of one block', () => {
  it('typing in the same block merges per character into one block', () => {
    const [a, b] = replicas([block('b1', 'hello')]);
    // Each person types into the block, one character at a time, before seeing the other
    let textA = 'hello';
    let textB = 'hello';
    for (const char of ' world') {
      textA += char;
      updateBlock(a, 'b1', { content: textA });
    }
    for (const char of '!!!') {
      textB = char + textB;
      updateBlock(b, 'b1', { content: textB });
    }
    exchange(a, b);

    expect(readBlocks(a)).toEqual(readBlocks(b));
    expect(ids(a)).toEqual(['b1']);
    const text = find(a, 'b1')!.content;
    expect(text).toHaveLength('hello world!!!'.length);
    expect(containsInOrder(text, 'hello world')).toBe(true);
    expect(text.startsWith('!!!') || text.includes('!!!')).toBe(true);
  });

  it('three people typing in one block all keep their text', () => {
    const [a, b, c] = replicas([block('b1', '')], 3);
    updateBlock(a, 'b1', { content: 'alpha' });
    updateBlock(b, 'b1', { content: 'beta' });
    updateBlock(c, 'b1', { content: 'gamma' });
    exchange(a, b, c);

    expect(readBlocks(a)).toEqual(readBlocks(b));
    expect(readBlocks(b)).toEqual(readBlocks(c));
    expect(ids(a)).toEqual(['b1']);
    const text = find(a, 'b1')!.content;
    expect(text).toHaveLength('alphabetagamma'.length);
    for (const word of ['alpha', 'beta', 'gamma']) expect(text).toContain(word);
  });

  it('an edit to the content and an edit to a property both survive', () => {
    const [a, b] = replicas([
      block('t1', 'task', { type: 'checkbox', properties: { checked: false, color: 'red' } }),
    ]);
    updateBlock(a, 't1', { content: 'task done' });
    updateBlock(b, 't1', { properties: { checked: true, color: 'red' } });
    exchange(a, b);

    for (const doc of [a, b]) {
      expect(find(doc, 't1')).toMatchObject({
        content: 'task done',
        properties: { checked: true, color: 'red' },
      });
    }
  });

  it('edits to two different properties both survive; the same property keeps one value', () => {
    const [a, b] = replicas([block('c1', 'x', { type: 'code', properties: { language: 'js' } })]);
    updateBlock(a, 'c1', { properties: { language: 'ts', wrap: true } });
    updateBlock(b, 'c1', { properties: { language: 'py', theme: 'dark' } });
    exchange(a, b);

    expect(readBlocks(a)).toEqual(readBlocks(b));
    const properties = find(a, 'c1')!.properties as Record<string, unknown>;
    expect(properties.wrap).toBe(true);
    expect(properties.theme).toBe('dark');
    expect(['ts', 'py']).toContain(properties.language);
  });

  it('a type change and a text edit both survive', () => {
    const [a, b] = replicas([block('b1', 'plan')]);
    updateBlock(a, 'b1', { type: 'heading2' });
    updateBlock(b, 'b1', { content: 'plan v2' });
    exchange(a, b);
    expect(find(a, 'b1')).toMatchObject({ type: 'heading2', content: 'plan v2' });
    expect(readBlocks(a)).toEqual(readBlocks(b));
  });
});

describe('concurrent move, insert and delete', () => {
  const base = () => [block('a', 'A'), block('b', 'B'), block('c', 'C')];

  it('a move and an edit of the same block both apply', () => {
    const [a, b] = replicas(base());
    moveBlock(a, 'a', 2);
    updateBlock(b, 'a', { content: 'A edited' });
    exchange(a, b);

    for (const doc of [a, b]) {
      expect(ids(doc)).toEqual(['b', 'c', 'a']);
      expect(find(doc, 'a')!.content).toBe('A edited');
    }
  });

  it('two moves of the same block leave it once, at one of the two places', () => {
    const [a, b] = replicas(base());
    moveBlock(a, 'a', 1); // b a c
    moveBlock(b, 'a', 2); // b c a
    exchange(a, b);

    expect(ids(a)).toEqual(ids(b));
    expect(ids(a).filter((id) => id === 'a')).toHaveLength(1);
    expect([...ids(a)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('moves of different blocks both apply', () => {
    const [a, b] = replicas(base());
    moveBlock(a, 'a', 2); // b c a
    moveBlock(b, 'c', 0); // c a b
    exchange(a, b);
    expect(ids(a)).toEqual(ids(b));
    expect([...ids(a)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('blocks inserted at the same place both stay, once each', () => {
    const [a, b] = replicas(base());
    insertBlock(a, 1, block('x', 'from A'));
    insertBlock(b, 1, block('y', 'from B'));
    exchange(a, b);
    expect(ids(a)).toEqual(ids(b));
    expect([...ids(a)].sort()).toEqual(['a', 'b', 'c', 'x', 'y']);
  });

  it('two blocks inserted with the same id leave one block', () => {
    const [a, b] = replicas(base());
    insertBlock(a, 3, block('same', 'one'));
    insertBlock(b, 3, block('same', 'two'));
    exchange(a, b);
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a).filter((id) => id === 'same')).toHaveLength(1);
  });

  it('a delete wins over a concurrent edit of the same block, everyone converges, nothing duplicates', () => {
    const [a, b] = replicas(base());
    deleteBlock(a, 'b');
    updateBlock(b, 'b', { content: 'B edited' });
    exchange(a, b);

    for (const doc of [a, b]) expect(ids(doc)).toEqual(['a', 'c']);
    expect(readBlocks(a)).toEqual(readBlocks(b));
  });

  it('two concurrent inserts of one id leave one block, and a delete of it takes both inserts away', () => {
    // Not reachable from the editor (ids are random); a crafted client can do it
    const [a, b] = replicas(base());
    insertBlock(a, 3, block('same', 'one'));
    insertBlock(b, 3, block('same', 'two'));
    exchange(a, b);
    expect(ids(a).filter((id) => id === 'same')).toHaveLength(1);
    // One block is left of the two inserts; deleting it removes the id for everyone
    deleteBlock(a, 'same');
    exchange(a, b);
    for (const doc of [a, b]) expect(ids(doc)).toEqual(['a', 'b', 'c']);
  });

  it('a delete wins over a concurrent move of the same block', () => {
    const [a, b] = replicas(base());
    deleteBlock(a, 'a');
    moveBlock(b, 'a', 2);
    exchange(a, b);
    for (const doc of [a, b]) expect(ids(doc)).toEqual(['b', 'c']);
  });

  it('an edit to one block and a delete of another both apply', () => {
    const [a, b] = replicas(base());
    deleteBlock(a, 'a');
    updateBlock(b, 'c', { content: 'C edited' });
    exchange(a, b);
    for (const doc of [a, b]) {
      expect(ids(doc)).toEqual(['b', 'c']);
      expect(find(doc, 'c')!.content).toBe('C edited');
    }
  });

  it('after any mix of concurrent operations all replicas agree and no id repeats', () => {
    // A fixed pseudo-random sequence of operations, three people, three rounds of concurrent edits.
    let seed = 12345;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const docs = replicas([block('a', 'one'), block('b', 'two'), block('c', 'three')], 3);
    let counter = 0;
    for (let round = 0; round < 3; round++) {
      for (const doc of docs) {
        for (let step = 0; step < 4; step++) {
          const current = readBlocks(doc);
          const pick = current[random(Math.max(1, current.length))];
          const op = random(5);
          if (op === 0 && pick)
            updateBlock(doc, pick.id, { content: `${pick.content}${counter++}` });
          else if (op === 1)
            insertBlock(doc, random(current.length + 1), block(`n${counter++}`, 'new'));
          else if (op === 2 && pick) moveBlock(doc, pick.id, random(current.length));
          else if (op === 3 && pick && current.length > 1) deleteBlock(doc, pick.id);
          else if (pick) updateBlock(doc, pick.id, { properties: { k: counter++ } });
        }
      }
      exchange(...docs);
      const [first, ...rest] = docs;
      for (const doc of rest) expect(readBlocks(doc)).toEqual(readBlocks(first));
      const all = ids(first);
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

describe('a reseeded server document and a client that kept its copy', () => {
  it('applying the reseeded state into the retained document duplicates nothing', () => {
    const stored = [block('b1', 'x'), block('b2', 'y')];
    const first = new Y.Doc();
    seedBlocks(first, stored);
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(first));

    // The server unloads the page and loads it again: the same blocks as a different document
    const second = new Y.Doc();
    seedBlocks(second, stored);
    Y.applyUpdate(client, Y.encodeStateAsUpdate(second));

    expect(readBlocks(client).map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(readBlocks(client).map((b) => b.content)).toEqual(['x', 'y']);
  });

  it('hands over what was typed offline when the held document is replaced', () => {
    const stored = [block('b1', 'hello'), block('b2', 'keep')];
    const held = new Y.Doc();
    seedBlocks(held, stored);
    const baseline = readBlocks(held);
    updateBlock(held, 'b1', { content: 'hello world, typed offline' });
    insertBlock(held, 2, block('b3', 'a new block'));
    deleteBlock(held, 'b2');

    const changes = changesSince(baseline, readBlocks(held));
    expect(changes).toEqual({
      blocks: [
        { id: 'b1', type: 'paragraph', text: 'hello world, typed offline' },
        { id: 'b3', type: 'paragraph', text: 'a new block' },
      ],
      removed: 1,
    });
    expect(changesSince(baseline, baseline)).toBeNull();
  });

  it('hands over what a block holds outside its text: table cells, and changed text properties', () => {
    const table = (cells: string[][]) =>
      block('t1', '', {
        type: 'table',
        properties: { tableData: { rows: cells.length, cols: 2, cells, headers: true } },
      });
    const image = (caption: string) =>
      block('i1', '', { type: 'image', properties: { imageUrl: '/uploads/a.png', caption } });
    const todo = (checked: boolean) =>
      block('c1', 'Ship it', { type: 'checkbox', properties: { checked } });
    const baseline = [
      table([
        ['Name', 'Role'],
        ['Ann', ''],
      ]),
      image(''),
      todo(false),
    ];
    const current = [
      table([
        ['Name', 'Role'],
        ['Ann', 'Owner'],
        ['Ben', 'Editor'],
      ]),
      image('Launch day'),
      todo(true),
      block('t2', '', {
        type: 'table',
        properties: { tableData: { rows: 1, cols: 2, cells: [['new', 'table']], headers: false } },
      }),
    ];

    expect(changesSince(baseline, current)).toEqual({
      blocks: [
        { id: 't1', type: 'table', text: 'Name\tRole\nAnn\tOwner\nBen\tEditor' },
        // Only the property that changed: the image itself is still on the server's page
        { id: 'i1', type: 'image', text: 'caption: Launch day' },
        { id: 'c1', type: 'checkbox', text: 'Ship it' },
        { id: 't2', type: 'table', text: 'new\ttable' },
      ],
      removed: 0,
    });
  });
});

describe('what is read back from the document', () => {
  it('has the same key order on every replica, whatever order the changes arrived in', () => {
    const [a, b] = replicas([
      block('p', 'x', { properties: { zeta: 1, alpha: 2 }, parentId: 'r' }),
    ]);
    updateBlock(a, 'p', { properties: { zeta: 1, alpha: 2, mid: 3 }, note: 'n' });
    updateBlock(b, 'p', { properties: { zeta: 1, alpha: 2, beta: 4 }, anchor: 'z' });
    exchange(a, b);
    const json = (doc: Y.Doc) => JSON.stringify(readBlocks(doc));
    expect(json(a)).toBe(json(b));
    const read = readBlocks(a)[0];
    expect(Object.keys(read)).toEqual([
      'id',
      'type',
      'content',
      'properties',
      'anchor',
      'children',
      'note',
      'parentId',
      'order',
    ]);
    expect(Object.keys(read.properties as object)).toEqual(['alpha', 'beta', 'mid', 'zeta']);
  });
});

describe('seed and save round trip', () => {
  const sampleProperties: Record<string, Record<string, unknown>> = {
    checkbox: { checked: true },
    code: { language: 'ts' },
    table: {
      tableData: {
        rows: 2,
        cols: 2,
        cells: [
          ['a', 'b'],
          ['c', '한글'],
        ],
        headers: true,
      },
    },
    image: {
      url: '/uploads/x.png',
      caption: '사진',
      alt: 'x',
      nested: { deep: [1, 2, { z: null }] },
    },
    callout: { color: 'red', icon: '🔥' },
    embed: { url: 'https://example.com/v' },
    math: { displayMode: 'inline' },
    synced_block: { originalBlockId: 'synced_1', isOriginal: false },
    page_embed: { pageId: 7 },
    database_inline: { schemaId: 3, view: { type: 'table', sort: [{ column: 'a', dir: 'asc' }] } },
  };

  it('every block type comes back exactly as stored', () => {
    const blocks = blockTypes.map(
      (type, order) =>
        ({
          id: `block_${type}`,
          type,
          content: type === 'divider' ? '' : `text of ${type} 😀 한국어\nsecond line`,
          properties: sampleProperties[type] ?? {},
          order,
          children: [],
        }) as Block
    );
    const doc = new Y.Doc();
    seedBlocks(doc, blocks);
    expect(readBlocks(doc)).toEqual(blocks);

    // ... and through the wire format a server and its clients use
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    expect(readBlocks(copy)).toEqual(blocks);
  });

  it('a page written as Markdown seeds and saves as the same blocks', () => {
    const markdown = [
      '# Title',
      '## 계획 개요',
      '- first\n- second',
      '* [x] done',
      '1. one\n2. two',
      '> quote',
      '```ts\nconst answer = 42;\n```',
      '---',
      '![[page:12]]',
      'closing paragraph',
    ].join('\n\n');
    const blocks = markdownToBlocks(markdown, { idPrefix: 'block_seed_9' });
    expect(blocks.length).toBeGreaterThan(5);
    const doc = new Y.Doc();
    seedBlocks(doc, blocks);
    expect(readBlocks(doc)).toEqual(blocks);
  });

  it('keeps fields beyond the usual ones, and gives a repeated id a new one without losing text', () => {
    const doc = new Y.Doc();
    seedBlocks(doc, [
      { ...block('a', 'first'), parentId: 'root' },
      block('a', 'second'),
      block('b', 'third'),
    ]);
    const read = readBlocks(doc);
    expect(read.map((b) => b.content)).toEqual(['first', 'second', 'third']);
    expect(new Set(read.map((b) => b.id)).size).toBe(3);
    expect(read[0]).toMatchObject({ id: 'a', parentId: 'root' });
  });

  it('an empty page seeds to an empty document', () => {
    const doc = new Y.Doc();
    seedBlocks(doc, []);
    expect(readBlocks(doc)).toEqual([]);
  });
});

describe('what a collaborator sends is never trusted', () => {
  it('skips entries that are not well-formed blocks and never repeats an id', () => {
    const doc = new Y.Doc();
    seedBlocks(doc, [block('ok', 'fine')]);
    // What a client with the right shape but hostile content could write
    doc.transact(() => {
      blockOrder(doc).push(['ok', 'ghost', 'plain', 'nameless', 'wrong-id']);
      const maps = blockMaps(doc);
      maps.set('plain', 'not a map' as any);
      const nameless = new Y.Map<unknown>();
      nameless.set('content', 'no id');
      maps.set('nameless', nameless);
      const wrong = new Y.Map<unknown>();
      wrong.set('id', 'someone-else');
      maps.set('wrong-id', wrong);
      const hostile = new Y.Map<unknown>();
      hostile.set('id', 'hostile');
      hostile.set('content', 42 as any);
      hostile.set('type', { not: 'a string' } as any);
      const props = new Y.Map<unknown>();
      props.set('__proto__', { polluted: true });
      props.set('fine', 1);
      hostile.set('properties', props);
      hostile.set('constructor', 'x');
      maps.set('hostile', hostile);
      blockOrder(doc).push(['hostile']);
    });

    const read = readBlocks(doc);
    expect(read.map((b) => b.id)).toEqual(['ok', 'hostile']);
    expect(read[1]).toMatchObject({ type: 'paragraph', content: '', properties: { fine: 1 } });
    expect(Object.getPrototypeOf(read[1].properties)).toBe(Object.prototype);
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(read[1], 'constructor')).toBe(false);
  });

  it('does not accept an id that is already taken or an edit of a block that is not there', () => {
    const doc = new Y.Doc();
    seedBlocks(doc, [block('a', 'one')]);
    expect(insertBlock(doc, 0, block('a', 'again'))).toBe(false);
    expect(updateBlock(doc, 'missing', { content: 'x' })).toBe(false);
    expect(deleteBlock(doc, 'missing')).toBe(false);
    expect(moveBlock(doc, 'missing', 0)).toBe(false);
    expect(readBlocks(doc).map(withoutOrder)).toEqual([withoutOrder(block('a', 'one'))]);
  });
});

describe('text edits', () => {
  it('diffText always yields an edit that turns the old text into the new one, whatever the caret', () => {
    let seed = 99;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const word = () => Array.from({ length: random(7) }, () => 'ab😀'[random(3)]).join('');
    for (let i = 0; i < 3000; i++) {
      const previous = word();
      const next = word();
      const caret = random(3) === 0 ? undefined : random(next.length + 1);
      const edit = diffText(previous, next, caret);
      if (!edit) {
        expect(previous).toBe(next);
        continue;
      }
      const applied =
        previous.slice(0, edit.index) + edit.insert + previous.slice(edit.index + edit.remove);
      expect(applied, `${previous} -> ${next} @${caret}`).toBe(next);
    }
  });

  it('diffText finds the changed span, keeps an edit at the caret in repeated text and never splits a surrogate pair', () => {
    expect(diffText('hello', 'hello')).toBeNull();
    expect(diffText('hello', 'hello world')).toEqual({ index: 5, remove: 0, insert: ' world' });
    expect(diffText('hello world', 'hello')).toEqual({ index: 5, remove: 6, insert: '' });
    expect(diffText('abcdef', 'abXYef')).toEqual({ index: 2, remove: 2, insert: 'XY' });
    // typing one more "a" after the first two: at the caret, not at the end of the run
    expect(diffText('aab', 'aaab', 3)).toEqual({ index: 2, remove: 0, insert: 'a' });
    // text typed next to a repeat of itself: the edit sits on the side of the repeat the caret is on
    expect(diffText('ab', 'aab', 1)).toEqual({ index: 0, remove: 0, insert: 'a' });
    expect(diffText('ab', 'aab', 2)).toEqual({ index: 1, remove: 0, insert: 'a' });
    expect(diffText('xa', 'xaa', 2)).toEqual({ index: 1, remove: 0, insert: 'a' });
    expect(diffText('abab', 'ababab', 4)).toEqual({ index: 2, remove: 0, insert: 'ab' });
    expect(diffText('abab', 'ababab', 2)).toEqual({ index: 0, remove: 0, insert: 'ab' });
    expect(diffText('aaa', 'aaaa', 2)).toEqual({ index: 1, remove: 0, insert: 'a' });
    // a deletion inside a run: the caret says which of the equal characters went
    expect(diffText('aaa', 'aa', 0)).toEqual({ index: 0, remove: 1, insert: '' });
    expect(diffText('aaa', 'aa', 1)).toEqual({ index: 1, remove: 1, insert: '' });
    expect(diffText('aaa', 'aa', 2)).toEqual({ index: 2, remove: 1, insert: '' });
    // an emoji replaced by another one that shares its first code unit
    const edit = diffText('x😀y', 'x😁y')!;
    expect(edit.index).toBe(1);
    expect(edit.remove).toBe(2);
    expect(edit.insert).toBe('😁');
  });

  it('applies an edit made in the middle of the text without touching the rest', () => {
    const [a, b] = replicas([block('p', 'The quick fox')]);
    updateBlock(a, 'p', { content: 'The quick brown fox' });
    updateBlock(b, 'p', { content: 'A quick fox' });
    exchange(a, b);
    expect(find(a, 'p')!.content).toBe('A quick brown fox');
    expect(readBlocks(a)).toEqual(readBlocks(b));
  });
});

describe("undo and redo of one person's own edits", () => {
  it('undo takes back what this person typed, not what a collaborator typed', () => {
    const [a, b] = replicas([block('p', 'Base')]);
    const undoA = createUndoManager(a);
    updateBlock(a, 'p', { content: 'Base A' });
    updateBlock(b, 'p', { content: 'B Base' });
    exchange(a, b);
    expect(find(a, 'p')!.content).toBe('B Base A');

    undoA.undo();
    expect(find(a, 'p')!.content).toBe('B Base');
    exchange(a, b);
    expect(find(b, 'p')!.content).toBe('B Base');

    undoA.redo();
    expect(find(a, 'p')!.content).toBe('B Base A');
  });

  it('a change that came from the server is not on the undo stack', () => {
    const [a, b] = replicas([block('p', 'Base')]);
    const undoA = createUndoManager(a);
    updateBlock(b, 'p', { content: 'Base from B' });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b), 'server');
    expect(undoA.canUndo()).toBe(false);
    undoA.undo();
    expect(find(a, 'p')!.content).toBe('Base from B');
  });
});

describe('tables', () => {
  const table = (cells: string[][]) => ({ rows: cells.length, cols: cells[0].length, cells });

  it('a table is one value: cells edited at the same moment keep one of the two edits (known limit)', () => {
    const base = table([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const [x, y] = replicas([block('t', '', { type: 'table', properties: { tableData: base } })]);
    updateBlock(x, 't', {
      properties: {
        tableData: table([
          ['A', 'b'],
          ['c', 'd'],
        ]),
      },
    });
    updateBlock(y, 't', {
      properties: {
        tableData: table([
          ['a', 'b'],
          ['c', 'D'],
        ]),
      },
    });
    exchange(x, y);
    expect(readBlocks(x)).toEqual(readBlocks(y));
    const cells = (find(x, 't')!.properties as any).tableData.cells as string[][];
    // Whole-table replacement: exactly one person's edit survives, never a mix and never both
    expect([cells[0][0] + cells[1][1]]).toSatisfy(
      ([pair]: string[]) => pair === 'Ad' || pair === 'aD'
    );
    expect(ids(x)).toEqual(['t']);
  });

  it.todo(
    'edits to different cells of one table both survive (needs a per-cell shared structure; the table block writes its whole table as one property value today)'
  );
});
