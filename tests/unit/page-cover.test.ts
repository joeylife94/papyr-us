import { afterEach, describe, expect, it } from 'vitest';
import {
  PAGE_COVER_IMAGE_PATH,
  PAGE_COVER_PRESETS,
  PAGE_COVER_PRESET_IDS,
  pageCoverSchema,
  readPageCover,
  sanitizePageMetadata,
  withPageCover,
  type PageCover,
  type UpdateWikiPage,
  type WikiPage,
} from '../../shared/schema';
import { clampCoverOffset, offsetAfterDrag, offsetAfterKey } from '../../client/src/lib/page-cover';
import {
  coverFromFrontmatter,
  coverFrontmatter,
  parseFrontmatter,
  serializeFrontmatter,
} from '../../server/services/vault-format';
import { buildVaultEntries, type VaultExportRow } from '../../server/services/vault-export';
import { normalizeVaultPath, planVaultImport } from '../../server/services/vault-import';
import { resetEditSessions, savePage, type PageSaveStore } from '../../server/services/page-save';

// Issue #134: page cover validation (P3-D1: presets or this instance's uploaded images only),
// metadata helpers, the reposition control, and the vault frontmatter round trip.

const IMAGE = '/api/uploads/images/1730000000000-0123456789abcdef-photo.png';

describe('pageCoverSchema', () => {
  it('accepts every built-in preset, each with fixed CSS', () => {
    for (const id of PAGE_COVER_PRESET_IDS) {
      expect(pageCoverSchema.parse({ type: 'preset', id })).toEqual({ type: 'preset', id });
      expect(PAGE_COVER_PRESETS[id].label).toBeTruthy();
      // Only gradients and hex colors: nothing that loads a resource.
      expect(PAGE_COVER_PRESETS[id].background).toMatch(
        /^(linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)|#[0-9a-f]{6})$/
      );
    }
  });

  it('accepts image paths the upload service produces, with an offset from 0 to 100', () => {
    for (const path of [
      IMAGE,
      '/api/uploads/images/1730000000000-ffffffffffffffff-.jpg',
      '/api/uploads/images/1730000000000-0123456789abcdef-a_b-C.JPEG',
      '/api/uploads/images/1730000000000-0123456789abcdef-x.gif',
      '/api/uploads/images/1730000000000-0123456789abcdef-x.webp',
    ]) {
      expect(PAGE_COVER_IMAGE_PATH.test(path), path).toBe(true);
    }
    for (const offsetY of [0, 1, 50, 99, 100]) {
      expect(pageCoverSchema.safeParse({ type: 'image', path: IMAGE, offsetY }).success).toBe(true);
    }
  });

  it('refuses external URLs, other paths and encoded or appended tricks', () => {
    for (const path of [
      'https://tracker.example/pixel.png',
      'http://tracker.example/api/uploads/images/1730000000000-0123456789abcdef-a.png',
      '//tracker.example/pixel.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '/api/uploads/files/1730000000000-0123456789abcdef-a.png',
      '/api/uploads/images/../../etc/passwd.png',
      '/api/uploads/images/1730000000000-0123456789abcdef-a%2F..png',
      '/api/uploads/images/1730000000000-0123456789abcdef-a b.png',
      '/api/uploads/images/1730000000000-0123456789abcdef-a.svg',
      '/api/uploads/images/1730000000000-0123456789abcdef-a.png.html',
      '/api/uploads/images/_meta_1730000000000-0123456789abcdef-a.png.json',
      `${IMAGE}?x=1`,
      `${IMAGE}#x`,
      `${IMAGE}\n`,
      ` ${IMAGE}`,
      `${IMAGE}"); background: url(x`,
      '/api/uploads/images/1730000000000-0123456789abcdeg-a.png',
      `/api/uploads/images/1730000000000-0123456789abcdef-${'a'.repeat(51)}.png`,
      '',
    ]) {
      expect(
        pageCoverSchema.safeParse({ type: 'image', path, offsetY: 50 }).success,
        JSON.stringify(path)
      ).toBe(false);
    }
  });

  it('refuses unknown presets, bad offsets, extra keys and other shapes', () => {
    for (const value of [
      { type: 'preset', id: 'unknown' },
      { type: 'preset', id: 'OCEAN' },
      { type: 'preset', id: 'constructor' },
      { type: 'preset', id: 'ocean', background: 'url(https://x.example)' },
      { type: 'image', path: IMAGE, offsetY: -1 },
      { type: 'image', path: IMAGE, offsetY: 101 },
      { type: 'image', path: IMAGE, offsetY: 33.3 },
      { type: 'image', path: IMAGE, offsetY: Number.NaN },
      { type: 'image', path: IMAGE, offsetY: '50' },
      { type: 'image', path: IMAGE },
      { type: 'image', path: IMAGE, offsetY: 50, alt: 'x' },
      { type: 'url', path: IMAGE },
      { id: 'ocean' },
      'ocean',
      null,
      [],
    ]) {
      expect(pageCoverSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });
});

describe('cover metadata helpers', () => {
  const preset: PageCover = { type: 'preset', id: 'sunset' };

  it('reads a valid cover and ignores anything else', () => {
    expect(readPageCover({ cover: preset, other: 1 })).toEqual(preset);
    for (const metadata of [
      undefined,
      null,
      'cover',
      [preset],
      {},
      { cover: { type: 'image', path: 'https://x.example/a.png', offsetY: 0 } },
      Object.create({ cover: preset }),
    ]) {
      expect(readPageCover(metadata)).toBeNull();
    }
  });

  it('sets and removes the cover key, keeping other keys', () => {
    expect(withPageCover({ a: 1 }, preset)).toEqual({ a: 1, cover: preset });
    const removed = withPageCover({ a: 1, cover: preset }, null);
    expect(removed).toEqual({ a: 1 });
    expect('cover' in removed).toBe(false);
    expect(withPageCover(null, preset)).toEqual({ cover: preset });
    expect(withPageCover(['x'], null)).toEqual({});
  });

  it('drops only an invalid cover when metadata is copied', () => {
    const valid = { a: 1, cover: preset };
    expect(sanitizePageMetadata(valid)).toBe(valid);
    expect(sanitizePageMetadata({ a: 1, cover: { type: 'preset', id: 'nope' } })).toEqual({ a: 1 });
    expect(sanitizePageMetadata({ a: 1 })).toEqual({ a: 1 });
    expect(sanitizePageMetadata(null)).toBeNull();
  });
});

describe('cover position control', () => {
  it('drags: down shows more of the top, clamped to 0..100', () => {
    expect(offsetAfterDrag(50, 0, 200)).toBe(50);
    expect(offsetAfterDrag(50, 40, 200)).toBe(30);
    expect(offsetAfterDrag(50, -40, 200)).toBe(70);
    expect(offsetAfterDrag(50, 1000, 200)).toBe(0);
    expect(offsetAfterDrag(50, -1000, 200)).toBe(100);
    expect(offsetAfterDrag(42, 10, 0)).toBe(42);
  });

  it('keys: arrows step by 5, Page Up/Down by 20, Home/End to the ends', () => {
    expect(offsetAfterKey(50, 'ArrowUp')).toBe(55);
    expect(offsetAfterKey(50, 'ArrowRight')).toBe(55);
    expect(offsetAfterKey(50, 'ArrowDown')).toBe(45);
    expect(offsetAfterKey(50, 'ArrowLeft')).toBe(45);
    expect(offsetAfterKey(90, 'PageUp')).toBe(100);
    expect(offsetAfterKey(10, 'PageDown')).toBe(0);
    expect(offsetAfterKey(50, 'Home')).toBe(0);
    expect(offsetAfterKey(50, 'End')).toBe(100);
    expect(offsetAfterKey(50, 'a')).toBeNull();
    expect(clampCoverOffset(Number.NaN)).toBe(50);
    expect(clampCoverOffset(12.6)).toBe(13);
  });
});

describe('cover frontmatter', () => {
  const roundTrip = (cover: PageCover | null) => {
    const { data } = parseFrontmatter(serializeFrontmatter(coverFrontmatter(cover)));
    return coverFromFrontmatter(data.cover, data.cover_offset_y);
  };

  it('round-trips a preset and an image with its position', () => {
    const preset: PageCover = { type: 'preset', id: 'lavender' };
    const image: PageCover = { type: 'image', path: IMAGE, offsetY: 0 };
    expect(coverFrontmatter(preset)).toEqual([['cover', 'lavender']]);
    expect(coverFrontmatter(image)).toEqual([
      ['cover', IMAGE],
      ['cover_offset_y', '0'],
    ]);
    expect(roundTrip(preset)).toEqual({ cover: preset, dropped: false });
    expect(roundTrip(image)).toEqual({ cover: image, dropped: false });
    expect(roundTrip(null)).toEqual({ cover: null, dropped: false });
  });

  it('defaults a missing or unreadable position to the middle', () => {
    for (const offset of [undefined, 'top', '-5', '1e2', ['10']] as const) {
      expect(coverFromFrontmatter(IMAGE, offset as any).cover).toEqual({
        type: 'image',
        path: IMAGE,
        offsetY: 50,
      });
    }
    expect(coverFromFrontmatter(IMAGE, '250').cover).toMatchObject({ offsetY: 100 });
  });

  it('drops external URLs, attachments and lists; no cover key is not a drop', () => {
    for (const value of [
      'https://tracker.example/pixel.png',
      '[[banner.png]]',
      'attachments/banner.png',
      '/api/uploads/images/../x.png',
      'unknown-preset',
      ['ocean'],
    ]) {
      expect(coverFromFrontmatter(value, undefined), JSON.stringify(value)).toEqual({
        cover: null,
        dropped: true,
      });
    }
    expect(coverFromFrontmatter(undefined, '10')).toEqual({ cover: null, dropped: false });
    expect(coverFromFrontmatter('', undefined)).toEqual({ cover: null, dropped: false });
  });

  it('survives a vault export and import with the rest of the page', () => {
    const row = (id: number, title: string, metadata: unknown): VaultExportRow => ({
      id,
      title,
      slug: `p${id}`,
      icon: null,
      parentId: null,
      position: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      content: 'body',
      tags: [],
      metadata,
    });
    const image: PageCover = { type: 'image', path: IMAGE, offsetY: 72 };
    const entries = buildVaultEntries(
      [
        row(1, 'Preset', { cover: { type: 'preset', id: 'mint' }, keep: 'x' }),
        row(2, 'Image', { cover: image }),
        row(3, 'None', {}),
        row(4, 'Legacy', { cover: { type: 'image', path: 'https://x.example/a.png' } }),
      ],
      new Map()
    );
    const files = entries.map((entry) => {
      const data = Buffer.from(entry.data);
      const segments = normalizeVaultPath(entry.name);
      return { path: segments.join('/'), segments, size: data.length, read: () => data };
    });
    const plan = planVaultImport(files);
    const coverOf = (title: string) => plan.pages.find((page) => page.title === title)?.cover;
    expect(coverOf('Preset')).toEqual({ type: 'preset', id: 'mint' });
    expect(coverOf('Image')).toEqual(image);
    expect(coverOf('None')).toBeNull();
    // The invalid stored cover was never exported, so nothing is dropped on import either.
    expect(coverOf('Legacy')).toBeNull();
    expect(plan.droppedCovers).toEqual([]);
  });
});

describe('save pipeline and covers', () => {
  afterEach(() => resetEditSessions());

  const makeStore = () => {
    let page = {
      id: 1,
      title: 'T',
      slug: 't',
      content: 'body',
      blocks: [{ id: 'b', type: 'paragraph', content: 'body' }],
      tags: [],
      metadata: { source: 'kept' },
    } as unknown as WikiPage;
    const updates: UpdateWikiPage[] = [];
    const snapshots: string[] = [];
    const store: PageSaveStore = {
      getPage: async () => page,
      updatePage: async (_id, data) => {
        updates.push(data);
        page = { ...page, ...(data as Partial<WikiPage>) };
        return page;
      },
      snapshotVersion: async (_page, description) => {
        snapshots.push(description);
      },
    };
    return { store, updates, snapshots, current: () => page };
  };

  it('writes the cover into metadata, keeps other keys, and keeps no version for it', async () => {
    const { store, updates, snapshots, current } = makeStore();
    const cover: PageCover = { type: 'preset', id: 'ocean' };
    await savePage(store, 1, { cover }, 'autosave');
    expect(updates).toEqual([{ metadata: { source: 'kept', cover } }]);

    // The same cover again changes nothing and writes nothing.
    await savePage(store, 1, { cover }, 'autosave');
    expect(updates).toHaveLength(1);

    await savePage(store, 1, { cover: null }, 'manual');
    expect(current().metadata).toEqual({ source: 'kept' });
    expect(snapshots).toEqual([]);
  });

  it('saves a cover together with a body edit in one write', async () => {
    const { store, updates, snapshots } = makeStore();
    const cover: PageCover = { type: 'image', path: IMAGE, offsetY: 10 };
    await savePage(
      store,
      1,
      { cover, blocks: [{ id: 'b', type: 'paragraph', content: 'new' }] as any },
      'autosave'
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ content: 'new', metadata: { source: 'kept', cover } });
    expect(snapshots).toEqual(['Before editing session']);
  });
});
