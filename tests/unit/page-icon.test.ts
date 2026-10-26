import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateWikiPage, WikiPage } from '../../shared/schema';
import { isValidPageIcon, pageIconField, PAGE_ICON_MAX_LENGTH } from '../../shared/page-icon';
import { EMOJI_CATALOG, searchEmojis } from '../../client/src/lib/emoji-catalog';
import {
  checkpointPage,
  hasOpenEditSession,
  resetEditSessions,
  savePage,
  setSessionClosedHandler,
  type PageSaveStore,
} from '../../server/services/page-save';

// Issue #103 E4: a page icon is exactly one emoji (or null), shared by the picker and the API,
// and setting it is an editor-level change that records no version and fires no workflow.

describe('isValidPageIcon', () => {
  it.each([
    ['plain emoji', '🔥'],
    ['document', '📄'],
    ['VS16 sequence', '❤️'],
    ['text-default symbol with VS16', '☀️'],
    ['skin tone', '👍🏽'],
    ['skin tone on a text-default base', '☝🏽'],
    ['ZWJ sequence', '👩‍💻'],
    ['ZWJ family', '👨‍👩‍👧‍👦'],
    ['ZWJ with VS16 parts', '🏳️‍🌈'],
    ['ZWJ with skin tones', '🧑🏽‍🤝‍🧑🏿'],
    ['ZWJ without trailing VS16', '🧑‍⚕'],
    ['kiss with skin tones (longest common sequence)', '🧑🏻‍❤️‍💋‍🧑🏼'],
    ['country flag', '🇰🇷'],
    ['subdivision flag', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
    ['keycap', '1️⃣'],
    ['keycap hash', '#️⃣'],
  ])('accepts %s', (_label, icon) => {
    expect(isValidPageIcon(icon)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['whitespace', ' '],
    ['newline', '\n'],
    ['a letter', 'a'],
    ['a word', '문서'],
    ['a digit', '1'],
    ['a hash sign', '#'],
    ['two emojis', '😀😀'],
    ['two flags', '🇰🇷🇺🇸'],
    ['leading space', ' 😀'],
    ['trailing space', '😀 '],
    ['emoji and text', '😀a'],
    ['markup', '<b>'],
    ['markup around an emoji', '<img src=x onerror=alert(1)>🔥'],
    ['dangling ZWJ', '😀‍'],
    ['lone regional indicator', '🇰'],
    ['lone skin tone', '🏽'],
    ['lone VS16', '️'],
    ['text-presentation symbol', '©'],
    ['over-long input', '😀'.repeat(PAGE_ICON_MAX_LENGTH)],
  ])('rejects %s', (_label, icon) => {
    expect(isValidPageIcon(icon)).toBe(false);
  });

  it('rejects values that are not strings', () => {
    for (const value of [null, undefined, 1, {}, ['🔥']]) {
      expect(isValidPageIcon(value)).toBe(false);
    }
  });

  it('is the API field: one emoji or null, nothing else', () => {
    expect(pageIconField.safeParse('🔥').success).toBe(true);
    expect(pageIconField.safeParse(null).success).toBe(true);
    expect(pageIconField.safeParse(undefined).success).toBe(true);
    for (const value of ['', 'icon', '🔥🔥', 42]) {
      expect(pageIconField.safeParse(value).success).toBe(false);
    }
  });
});

describe('emoji catalog', () => {
  it('offers about 150 distinct emojis, each a valid page icon with Korean and English terms', () => {
    expect(EMOJI_CATALOG.length).toBeGreaterThanOrEqual(150);
    expect(new Set(EMOJI_CATALOG.map((entry) => entry.emoji)).size).toBe(EMOJI_CATALOG.length);
    for (const entry of EMOJI_CATALOG) {
      expect(isValidPageIcon(entry.emoji), entry.emoji).toBe(true);
      expect(entry.name).toMatch(/[가-힣]/);
      expect(
        entry.keywords.some((keyword) => /[a-z]/.test(keyword)),
        entry.emoji
      ).toBe(true);
    }
  });

  it('lists everything for an empty query', () => {
    expect(searchEmojis('  ')).toHaveLength(EMOJI_CATALOG.length);
  });

  it('finds emojis by Korean or English terms, prefix matches first', () => {
    expect(searchEmojis('불')[0].emoji).toBe('🔥');
    expect(searchEmojis('FIRE')[0].emoji).toBe('🔥');
    expect(searchEmojis('문서').map((entry) => entry.emoji)).toContain('📄');
    const rocket = searchEmojis('rocket');
    expect(rocket.map((entry) => entry.emoji)).toEqual(['🚀']);
    expect(searchEmojis('zzzz-no-match')).toEqual([]);
  });

  it('offers a typed or pasted emoji that is not in the catalog', () => {
    expect(searchEmojis('🦖')[0]).toEqual({ emoji: '🦖', name: '🦖', keywords: [] });
    // A catalog emoji is not offered twice, and text is never offered as an icon.
    expect(searchEmojis('🔥').filter((entry) => entry.emoji === '🔥')).toHaveLength(1);
    expect(searchEmojis('<b>')).toEqual([]);
  });
});

describe('icon saves through the autosave pipeline', () => {
  const page = {
    id: 1,
    title: 'Handbook',
    slug: 'handbook',
    content: 'v0',
    blocks: [{ id: 'b0', type: 'paragraph', content: 'v0' }],
    folder: 'docs',
    tags: ['ops'],
    author: 'alice',
    icon: null,
  } as unknown as WikiPage;

  function makeStore() {
    let current = page;
    const snapshots: string[] = [];
    const store: PageSaveStore = {
      getPage: async () => current,
      updatePage: async (_id, data: UpdateWikiPage) => {
        current = { ...current, ...(data as Partial<WikiPage>) };
        return current;
      },
      snapshotVersion: async (_page, description) => {
        snapshots.push(description);
      },
    };
    return { store, snapshots, current: () => current };
  }

  afterEach(() => {
    resetEditSessions();
    setSessionClosedHandler(null);
  });

  it('stores an icon-only autosave without a version, a session or a workflow', async () => {
    const closed = vi.fn();
    setSessionClosedHandler(closed);
    const { store, snapshots, current } = makeStore();

    await savePage(store, 1, { icon: '🚀' }, 'autosave');
    await savePage(store, 1, { icon: null }, 'autosave');

    expect(current().icon).toBeNull();
    expect(snapshots).toEqual([]);
    expect(hasOpenEditSession(1)).toBe(false);
    expect(await checkpointPage(1)).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });

  it('still versions a title change saved together with the icon', async () => {
    const { store, snapshots, current } = makeStore();

    await savePage(store, 1, { icon: '📚', title: 'Library' }, 'autosave');

    expect(current()).toMatchObject({ icon: '📚', title: 'Library' });
    expect(snapshots).toEqual(['Before editing session']);
    expect(hasOpenEditSession(1)).toBe(true);
  });
});
