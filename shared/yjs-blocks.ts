/**
 * The shared (Yjs) shape of a page's blocks, and the one place that converts between it and the
 * stored `wiki_pages.blocks` JSON. The server seeds a document with `seedBlocks` and saves with
 * `readBlocks`; the browser edits through the helpers below and renders with `readBlocks`.
 *
 * Shape (version 2; `YJS_SCHEMA_VERSION`):
 * - `blockOrder`: a `Y.Array<string>` of block ids, the order of the page;
 * - `blockMaps`: a `Y.Map` from block id to that block's `Y.Map`;
 * - a block's map holds `id` and `type` (plain values), `content` (a `Y.Text`), `properties` (a
 *   `Y.Map` of plain JSON values, so edits to different properties merge) and any other stored
 *   field (`children`, `parentId`, ...) as a plain value under its own key.
 *
 * Order and content are separate so that a move only touches the order: an edit made to a block
 * while someone else moves it survives, and a block keeps one identity for its whole life.
 * Outcomes of concurrent edits (all of them converge, none duplicates a block id):
 * - typing in the same block merges per character;
 * - edits to different fields or properties of a block both survive; the same property set to
 *   different values keeps one of them (last writer in Yjs order);
 * - two moves of one block leave it at one of the two destinations;
 * - a delete wins over an edit or a move of the same block;
 * - two blocks inserted with the same id leave one block (the first in the order).
 *
 * Everything read from a document is untrusted (any editor can send any update): `readBlocks`
 * skips entries that are not well-formed blocks, never yields a block id twice, and keeps
 * prototype-polluting keys out of the result.
 */
import * as Y from 'yjs';
import type { Block } from './schema.js';
import { jsonEqual } from './json-equal.js';

/** Bumped when the shape above changes; clients and servers of different versions refuse each other. */
export const YJS_SCHEMA_VERSION = 2;

export const BLOCK_ORDER_KEY = 'blockOrder';
export const BLOCK_MAPS_KEY = 'blockMaps';

/** Transaction origin of this browser's own edits (anything but 'server' is sent to the server). */
export const LOCAL_ORIGIN = 'papyrus:local';

const RESERVED_KEYS = new Set(['id', 'type', 'content', 'properties']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type BlockMap = Y.Map<unknown>;

export function blockOrder(doc: Y.Doc): Y.Array<string> {
  return doc.getArray<string>(BLOCK_ORDER_KEY);
}

export function blockMaps(doc: Y.Doc): Y.Map<BlockMap> {
  return doc.getMap<BlockMap>(BLOCK_MAPS_KEY);
}

function plain(value: unknown): unknown {
  return value instanceof Y.AbstractType ? value.toJSON() : value;
}

function assignSafe(target: Record<string, unknown>, key: string, value: unknown) {
  if (UNSAFE_KEYS.has(key)) return;
  target[key] = value;
}

/** A block as a Y.Map. `content` becomes a Y.Text, `properties` a Y.Map. */
export function createBlockMap(block: Partial<Block> & { id: string }): BlockMap {
  const map: BlockMap = new Y.Map();
  map.set('id', block.id);
  map.set('type', typeof block.type === 'string' ? block.type : 'paragraph');
  const text = new Y.Text();
  if (typeof block.content === 'string' && block.content) text.insert(0, block.content);
  map.set('content', text);
  const properties = new Y.Map<unknown>();
  const source =
    block.properties && typeof block.properties === 'object' && !Array.isArray(block.properties)
      ? (block.properties as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && !UNSAFE_KEYS.has(key)) properties.set(key, value);
  }
  map.set('properties', properties);
  for (const [key, value] of Object.entries(block)) {
    // `order` is the position in `blockOrder`, never stored.
    if (RESERVED_KEYS.has(key) || key === 'order' || value === undefined) continue;
    if (UNSAFE_KEYS.has(key)) continue;
    map.set(key, value);
  }
  return map;
}

/** Reads one block map; null when it is not a well-formed block. `order` is filled by the caller. */
export function readBlock(value: unknown): Omit<Block, 'order'> | null {
  if (!(value instanceof Y.Map)) return null;
  const id = value.get('id');
  if (typeof id !== 'string' || id === '') return null;
  const type = value.get('type');
  const content = value.get('content');
  const properties = value.get('properties');
  const result: Record<string, unknown> = {
    id,
    type: typeof type === 'string' && type ? type : 'paragraph',
    content:
      content instanceof Y.Text ? content.toString() : typeof content === 'string' ? content : '',
  };
  const props: Record<string, unknown> = {};
  if (properties instanceof Y.Map) {
    properties.forEach((v, k) => assignSafe(props, k, plain(v)));
  } else if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [k, v] of Object.entries(properties)) assignSafe(props, k, v);
  }
  result.properties = props;
  value.forEach((v, k) => {
    if (!RESERVED_KEYS.has(k) && k !== 'order') assignSafe(result, k, plain(v));
  });
  return result as Omit<Block, 'order'>;
}

/** The page's blocks in order, as the stored JSON (`order` is the position). */
export function readBlocks(doc: Y.Doc): Block[] {
  const maps = blockMaps(doc);
  const seen = new Set<string>();
  const blocks: Block[] = [];
  for (const id of blockOrder(doc).toArray()) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    const block = readBlock(maps.get(id));
    if (!block || block.id !== id) continue;
    seen.add(id);
    blocks.push({ ...block, order: blocks.length } as Block);
  }
  return blocks;
}

/** Ids of the blocks that currently show, in order (same filter as `readBlocks`). */
export function visibleBlockIds(doc: Y.Doc): string[] {
  const maps = blockMaps(doc);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of blockOrder(doc).toArray()) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    const map = maps.get(id);
    if (!(map instanceof Y.Map) || map.get('id') !== id) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Undo and redo of this person's own edits: changes made through the helpers above (origin
 * `LOCAL_ORIGIN`) are tracked, and a collaborator's changes are never undone. Typing in quick
 * succession is one step.
 */
export function createUndoManager(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager([blockOrder(doc), blockMaps(doc)], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 500,
  });
}

/** Unique ids for stored blocks: a later block repeating an id keeps its content under a new id. */
function uniqueBlocks(blocks: Array<Partial<Block>>): Array<Partial<Block> & { id: string }> {
  const used = new Set<string>();
  const result: Array<Partial<Block> & { id: string }> = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    let id = typeof block.id === 'string' && block.id ? block.id : `block_${result.length}`;
    for (let n = 2; used.has(id); n += 1) id = `${block.id ?? 'block'}_dup${n}`;
    used.add(id);
    result.push({ ...block, id });
  }
  return result;
}

/** Index in `blockOrder` of the `index`-th visible block (the end when there is none). */
function rawIndexForVisible(doc: Y.Doc, index: number): number {
  const order = blockOrder(doc).toArray();
  const maps = blockMaps(doc);
  const seen = new Set<string>();
  let visible = 0;
  for (let raw = 0; raw < order.length; raw += 1) {
    const id = order[raw];
    if (typeof id !== 'string' || seen.has(id)) continue;
    const map = maps.get(id);
    if (!(map instanceof Y.Map) || map.get('id') !== id) continue;
    seen.add(id);
    if (visible === index) return raw;
    visible += 1;
  }
  return order.length;
}

function removeFromOrder(doc: Y.Doc, id: string) {
  const order = blockOrder(doc);
  for (let i = order.length - 1; i >= 0; i -= 1) {
    if (order.get(i) === id) order.delete(i, 1);
  }
}

/** Replaces everything in the document with `blocks` (one transaction). */
export function seedBlocks(doc: Y.Doc, blocks: Array<Partial<Block>>, origin?: unknown): void {
  const prepared = uniqueBlocks(Array.isArray(blocks) ? blocks : []);
  doc.transact(() => {
    const order = blockOrder(doc);
    const maps = blockMaps(doc);
    if (order.length > 0) order.delete(0, order.length);
    for (const key of Array.from(maps.keys())) maps.delete(key);
    for (const block of prepared) maps.set(block.id, createBlockMap(block));
    if (prepared.length > 0) order.push(prepared.map((block) => block.id));
  }, origin);
}

/**
 * The edit that turns `previous` into `next`: the span between their common prefix and common
 * suffix. `caret` (the caret after the edit) keeps the edit at the caret when the text repeats
 * itself, and a span never splits a surrogate pair.
 */
export function diffText(
  previous: string,
  next: string,
  caret?: number
): { index: number; remove: number; insert: string } | null {
  if (previous === next) return null;
  const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
  const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
  const max = Math.min(previous.length, next.length);
  let prefix = 0;
  const prefixLimit = caret === undefined ? max : Math.max(0, Math.min(max, caret));
  while (prefix < prefixLimit && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++;
  if (prefix > 0 && isHigh(previous.charCodeAt(prefix - 1))) prefix--;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    previous.charCodeAt(previous.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
  ) {
    suffix++;
  }
  if (suffix > 0 && isLow(previous.charCodeAt(previous.length - suffix))) suffix--;
  return {
    index: prefix,
    remove: previous.length - prefix - suffix,
    insert: next.slice(prefix, next.length - suffix),
  };
}

function applyTextEdit(text: Y.Text, next: string, caret?: number) {
  const edit = diffText(text.toString(), next, caret);
  if (!edit) return;
  if (edit.remove > 0) text.delete(edit.index, edit.remove);
  if (edit.insert) text.insert(edit.index, edit.insert);
}

/** What `updateBlock` accepts: any stored field except the id and the position. */
export type BlockPatch = Partial<Omit<Block, 'id' | 'order'>> & Record<string, unknown>;

/**
 * Applies `patch` to the block `id`: `content` as a text edit, `properties` key by key, every
 * other field as a plain value. Returns false when there is no such block. `caret` is the caret
 * after a content edit (see `diffText`).
 */
export function updateBlock(doc: Y.Doc, id: string, patch: BlockPatch, caret?: number): boolean {
  const map = blockMaps(doc).get(id);
  if (!(map instanceof Y.Map)) return false;
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || key === 'id' || key === 'order' || UNSAFE_KEYS.has(key)) continue;
      if (key === 'content') {
        let text = map.get('content');
        if (!(text instanceof Y.Text)) {
          text = new Y.Text();
          map.set('content', text);
        }
        applyTextEdit(text as Y.Text, typeof value === 'string' ? value : '', caret);
      } else if (key === 'properties') {
        let properties = map.get('properties');
        if (!(properties instanceof Y.Map)) {
          properties = new Y.Map<unknown>();
          map.set('properties', properties);
        }
        const target = properties as Y.Map<unknown>;
        const next = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const nextEntries = next as Record<string, unknown>;
        for (const existing of Array.from(target.keys())) {
          if (!Object.prototype.hasOwnProperty.call(nextEntries, existing)) target.delete(existing);
        }
        for (const [k, v] of Object.entries(nextEntries)) {
          if (v === undefined || UNSAFE_KEYS.has(k)) continue;
          if (!target.has(k) || !jsonEqual(plain(target.get(k)), v)) target.set(k, v);
        }
      } else if (key === 'type') {
        if (typeof value === 'string' && map.get('type') !== value) map.set('type', value);
      } else if (!jsonEqual(plain(map.get(key)), value)) {
        map.set(key, value);
      }
    }
  }, LOCAL_ORIGIN);
  return true;
}

/** Inserts `block` so that it shows at `index` (clamped). False when its id is already in use. */
export function insertBlock(doc: Y.Doc, index: number, block: Partial<Block> & { id: string }) {
  if (typeof block.id !== 'string' || block.id === '') return false;
  const maps = blockMaps(doc);
  if (maps.get(block.id) instanceof Y.Map) return false;
  doc.transact(() => {
    removeFromOrder(doc, block.id); // a leftover position of a block that was deleted
    maps.set(block.id, createBlockMap(block));
    const at = rawIndexForVisible(doc, Math.max(0, index));
    blockOrder(doc).insert(at, [block.id]);
  }, LOCAL_ORIGIN);
  return true;
}

/** Removes the block `id` (and every position it holds). False when there is no such block. */
export function deleteBlock(doc: Y.Doc, id: string): boolean {
  const maps = blockMaps(doc);
  const inOrder = blockOrder(doc).toArray().includes(id);
  if (!(maps.get(id) instanceof Y.Map) && !inOrder) return false;
  doc.transact(() => {
    removeFromOrder(doc, id);
    maps.delete(id);
  }, LOCAL_ORIGIN);
  return true;
}

/** Moves the block `id` so that it shows at `to` in the list without it. False if nothing moved. */
export function moveBlock(doc: Y.Doc, id: string, to: number): boolean {
  const visible = visibleBlockIds(doc);
  const from = visible.indexOf(id);
  if (from === -1) return false;
  const target = Math.max(0, Math.min(to, visible.length - 1));
  if (target === from) return false;
  doc.transact(() => {
    removeFromOrder(doc, id);
    blockOrder(doc).insert(rawIndexForVisible(doc, target), [id]);
  }, LOCAL_ORIGIN);
  return true;
}

/**
 * Changes a browser made to the page that a server document does not have: the text of every block
 * that is new or differs from `baseline`, and how many blocks of `baseline` are gone. Null when the
 * two are the same.
 */
export interface OfflineChanges {
  blocks: Array<{ id: string; type: string; text: string }>;
  removed: number;
}

export function changesSince(baseline: Block[], current: Block[]): OfflineChanges | null {
  const before = new Map(baseline.map((block) => [block.id, block]));
  const after = new Set(current.map((block) => block.id));
  const blocks: OfflineChanges['blocks'] = [];
  for (const block of current) {
    const old = before.get(block.id);
    const same =
      old !== undefined &&
      old.type === block.type &&
      old.content === block.content &&
      jsonEqual(old.properties ?? {}, block.properties ?? {});
    if (!same) blocks.push({ id: block.id, type: block.type, text: block.content });
  }
  const removed = baseline.filter((block) => !after.has(block.id)).length;
  return blocks.length === 0 && removed === 0 ? null : { blocks, removed };
}
