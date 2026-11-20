/**
 * The autosave controller behind the page editor (WP1), with a mocked `fetch` and fake timers.
 *
 * - Every save names the base revision; an answer moves it on.
 * - A refusal (409) whose changed fields are not among the fields being written is not a
 *   conflict: the other fields are adopted (before anything is resent), the new base is taken and
 *   the same patch is sent again, once. A second refusal in a row is a conflict.
 * - A refusal where a field being written also changed is a conflict: autosaving stops, edits
 *   are only collected, and the colliding fields are listed (and grow as more fields are edited).
 * - Keep mine adopts what else changed and then saves; load latest sends the typed title and body
 *   once more on the old base (so the server records it), reads the current page and drops edits;
 *   leaving with a conflict open does the same preserving step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutosaveController,
  IDLE_DELAY_MS,
  type PageWithRevision,
} from '../../client/src/lib/page-autosave-controller';

/** A response that settles in microtasks (a real Response parses its body through streams). */
const reply = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

type Call = { url: string; method: string; body: any; keepalive: boolean };

const rev = (
  title: string,
  blocks = 'b0',
  tags = 't0',
  folder = 'f0',
  icon = 'i0',
  cover = 'c0'
) => ({
  title,
  blocks,
  tags,
  folder,
  icon,
  cover,
});

const stored = (revision: string, fieldRevisions = rev('x'), extra: object = {}) =>
  ({
    id: 7,
    revision,
    fieldRevisions,
    title: 'Stored title',
    blocks: [],
    tags: [],
    folder: 'docs',
    icon: null,
    metadata: {},
    ...extra,
  }) as unknown as PageWithRevision;

const conflictAnswer = (page: PageWithRevision) =>
  reply(409, {
    message: 'changed',
    code: 'page_revision_conflict',
    currentRevision: page.revision,
    page,
  });

const savedAnswer = (revision: string, fieldRevisions = rev('x')) =>
  reply(200, { id: 7, slug: 's', title: 'T', revision, fieldRevisions, savedAt: 'now' });

let calls: Call[];
let answers: Array<() => Response | Promise<Response>>;
let events: string[];

const fetchStub = vi.fn(async (url: any, init: any = {}) => {
  calls.push({
    url: String(url),
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
    keepalive: !!init.keepalive,
  });
  events.push(`fetch ${init.method ?? 'GET'} ${String(url).split('/').slice(-1)[0]}`);
  const next = answers.shift();
  return next ? next() : reply(200, {});
});

const saves = () => calls.filter((c) => c.method === 'PUT');

function controller(options: { guarded?: boolean; page?: PageWithRevision } = {}) {
  const ctl = new AutosaveController({
    pageId: 7,
    page: options.page ?? stored('r1', rev('x')),
    guarded: options.guarded,
    fetchImpl: fetchStub as unknown as typeof fetch,
  });
  ctl.handlers = {
    adopt: (_page, fields) => events.push(`adopt ${fields.join(',')}`),
  };
  return ctl;
}

/** Let the scheduled save run and its promises settle. */
const settle = async (ms = IDLE_DELAY_MS) => {
  await vi.advanceTimersByTimeAsync(ms);
  // A re-base is resent on the next tick (a zero delay counts as 1 ms to the fake clock).
  await vi.advanceTimersByTimeAsync(5);
};

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  answers = [];
  events = [];
  fetchStub.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('saving with a base revision', () => {
  it('names the base revision it loaded, and the revision of each answer after that', async () => {
    const ctl = controller();
    answers.push(() => savedAnswer('r2', rev('y')));
    ctl.queue({ title: 'One' });
    await settle();
    expect(saves()[0].body).toEqual({ title: 'One', baseRevision: 'r1' });
    expect(ctl.getSnapshot().status).toBe('saved');

    ctl.queue({ title: 'Two' });
    await settle();
    expect(saves()[1].body).toEqual({ title: 'Two', baseRevision: 'r2' });
  });

  it('sends no base when unguarded (realtime collaboration saves the page itself)', async () => {
    const ctl = controller({ guarded: false });
    ctl.queue({ title: 'One' });
    await settle();
    expect(saves()[0].body).toEqual({ title: 'One' });
  });

  it('merges edits made while a save is in flight into the next one', async () => {
    const ctl = controller();
    let release!: (r: Response) => void;
    answers.push(() => new Promise<Response>((resolve) => (release = resolve)));
    ctl.queue({ title: 'One' });
    await settle();
    ctl.queue({ folder: 'a' });
    ctl.queue({ tags: ['x'] });
    release(savedAnswer('r2'));
    await settle();
    expect(saves()).toHaveLength(2);
    expect(saves()[1].body).toEqual({ folder: 'a', tags: ['x'], baseRevision: 'r2' });
  });

  it('keeps the patch and retries when the network fails', async () => {
    const ctl = controller();
    answers.push(() => Promise.reject(new Error('offline')));
    ctl.queue({ title: 'One' });
    await settle();
    expect(ctl.getSnapshot().status).toBe('error');
    await settle(2000);
    expect(saves()).toHaveLength(2);
    expect(saves()[1].body).toEqual(saves()[0].body);
  });
});

describe('a refusal that does not touch what is being written', () => {
  it('adopts the other fields, takes the new base and sends the same patch again, without a notice', async () => {
    const ctl = controller();
    // Someone changed the body and the tags; this editor writes only the title.
    const now = stored('r2', rev('x', 'b1', 't1'));
    answers.push(
      () => conflictAnswer(now),
      () => savedAnswer('r3', rev('y', 'b1', 't1'))
    );
    ctl.queue({ title: 'Mine' });
    await settle();

    expect(saves()).toHaveLength(2);
    expect(saves()[1].body).toEqual({ title: 'Mine', baseRevision: 'r2' });
    expect(ctl.getSnapshot().conflict).toBeNull();
    expect(ctl.getSnapshot().status).toBe('saved');
    // What they changed is shown before the same patch goes out again.
    expect(events).toEqual(['fetch PUT autosave', 'adopt blocks,tags', 'fetch PUT autosave']);
  });

  it('takes the answer of the retry as the new base', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('x', 'b1'))),
      () => savedAnswer('r3', rev('y', 'b1')),
      () => savedAnswer('r4', rev('z', 'b1'))
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    ctl.queue({ title: 'Mine again' });
    await settle();
    expect(saves()[2].body.baseRevision).toBe('r3');
  });

  it('treats a change that is not in any editable field (metadata) as nothing to adopt', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('x'))),
      () => savedAnswer('r3', rev('y'))
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    expect(events).toContain('adopt ');
    expect(saves()).toHaveLength(2);
    expect(ctl.getSnapshot().conflict).toBeNull();
  });

  it('retries once: a second refusal in a row for the same patch is the ordinary conflict', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('x', 'b1'))),
      () => conflictAnswer(stored('r3', rev('x', 'b2')))
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    await settle(10000);

    expect(saves()).toHaveLength(2);
    const snapshot = ctl.getSnapshot();
    expect(snapshot.status).toBe('conflict');
    expect(snapshot.conflict?.currentRevision).toBe('r3');
    // The retry was based on the first answer, so what differs now is what changed since.
    expect(snapshot.conflict?.fields).toEqual(['blocks']);
  });

  it('a successful save re-arms the one retry for the next refusal', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('x', 'b1'))),
      () => savedAnswer('r3', rev('y', 'b1')),
      () => conflictAnswer(stored('r4', rev('y', 'b2'))),
      () => savedAnswer('r5', rev('z', 'b2'))
    );
    ctl.queue({ title: 'One' });
    await settle();
    ctl.queue({ title: 'Two' });
    await settle();
    expect(saves()).toHaveLength(4);
    expect(ctl.getSnapshot().conflict).toBeNull();
  });
});

describe('a refusal on a field being written', () => {
  it('is a conflict: it names the colliding fields, stops saving and only collects edits', async () => {
    const ctl = controller();
    answers.push(() => conflictAnswer(stored('r2', rev('y', 'b1'))));
    ctl.queue({ title: 'Mine' });
    await settle();

    const snapshot = ctl.getSnapshot();
    expect(snapshot.status).toBe('conflict');
    expect(snapshot.conflict?.fields).toEqual(['title']);
    expect(events).toEqual(['fetch PUT autosave']);

    ctl.queue({ folder: 'elsewhere' });
    await settle(10000);
    expect(saves()).toHaveLength(1);
    expect(ctl.getSnapshot().status).toBe('conflict');
    // The body also changed in the stored page; once it is edited here, it collides too.
    expect(ctl.getSnapshot().conflict?.fields).toEqual(['title']);
    ctl.queue({ blocks: [] });
    expect(ctl.getSnapshot().conflict?.fields).toEqual(['title', 'blocks']);
  });

  it('is a conflict whenever the server does not say which fields changed', async () => {
    const ctl = controller({ page: { revision: 'r1' } as PageWithRevision });
    const now = stored('r2');
    delete now.fieldRevisions;
    answers.push(() => conflictAnswer(now));
    ctl.queue({ title: 'Mine' });
    await settle();
    expect(ctl.getSnapshot().status).toBe('conflict');
  });
});

describe('keep mine', () => {
  it('adopts what else changed, then saves the edits on the current revision', async () => {
    const ctl = controller();
    const now = stored('r2', rev('y', 'b1', 't0', 'f9'));
    answers.push(
      () => conflictAnswer(now),
      () => savedAnswer('r3', rev('z', 'b1', 't0', 'f9'))
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    ctl.keepMine();
    await settle(0);

    expect(events).toEqual(['fetch PUT autosave', 'adopt blocks,folder', 'fetch PUT autosave']);
    expect(saves()[1].body).toEqual({ title: 'Mine', baseRevision: 'r2' });
    expect(ctl.getSnapshot().conflict).toBeNull();
    expect(ctl.getSnapshot().status).toBe('saved');
  });

  it('does not adopt a field that was edited while the notice was open', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('y', 'b1'))),
      () => savedAnswer('r3')
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    ctl.queue({ blocks: [{ id: 'b' } as any] });
    ctl.keepMine();
    await settle(0);
    expect(events).toContain('adopt ');
    expect(saves()[1].body.blocks).toEqual([{ id: 'b' }]);
  });

  it('a refusal of the overwrite itself is a conflict again, not a silent retry loop', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('y'))),
      () => conflictAnswer(stored('r3', rev('z')))
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    ctl.keepMine();
    await settle(10000);
    expect(saves()).toHaveLength(2);
    expect(ctl.getSnapshot().status).toBe('conflict');
  });
});

describe('load latest', () => {
  it('keeps the typed title and body on record, reads the current page and drops the edits', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('y', 'b1'))),
      () => conflictAnswer(stored('r2', rev('y', 'b1'))),
      () => reply(200, stored('r9', rev('y', 'b2')))
    );
    ctl.queue({ blocks: [{ id: 'first' } as any] });
    await settle();
    ctl.queue({ blocks: [{ id: 'typed after the notice' } as any], tags: ['t'] });
    const latest = await ctl.loadLatest();

    // Once more on the old base so the server records it; then the page as it is now.
    expect(saves()[1].body.baseRevision).toBe('r1');
    expect(saves()[1].body.blocks).toEqual([{ id: 'typed after the notice' }]);
    expect(calls[2]).toMatchObject({ url: '/api/pages/7', method: 'GET' });
    expect(latest?.revision).toBe('r9');
    expect(ctl.getSnapshot()).toMatchObject({ status: 'idle', conflict: null });
    expect(ctl.hasPendingEdits).toBe(false);

    answers.push(() => savedAnswer('r10'));
    ctl.queue({ title: 'After' });
    await settle();
    expect(saves()[2].body.baseRevision).toBe('r9');
  });

  it('falls back to the page as of the refusal when the read fails', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('y', 'b1'))),
      () => conflictAnswer(stored('r2', rev('y', 'b1'))),
      () => Promise.reject(new Error('offline'))
    );
    ctl.queue({ blocks: [] });
    await settle();
    const latest = await ctl.loadLatest();
    expect(latest?.revision).toBe('r2');
  });
});

describe('leaving with a conflict open', () => {
  it('sends the typed title and body once more on the old base, then checkpoints', async () => {
    const ctl = controller();
    answers.push(() => conflictAnswer(stored('r2', rev('y', 'b1'))));
    ctl.queue({ blocks: [{ id: 'first' } as any] });
    await settle();
    ctl.queue({ blocks: [{ id: 'typed later' } as any] });
    await ctl.dispose();

    expect(saves()).toHaveLength(2);
    expect(saves()[1]).toMatchObject({ keepalive: true });
    expect(saves()[1].body).toEqual({ blocks: [{ id: 'typed later' }], baseRevision: 'r1' });
    expect(calls[calls.length - 1].url).toBe('/api/pages/7/checkpoint');
  });

  it('has nothing to send when only properties the history does not keep were edited', async () => {
    const ctl = controller();
    answers.push(() => conflictAnswer(stored('r2', rev('x', 'b0', 't1'))));
    ctl.queue({ tags: ['mine'] });
    await settle();
    await ctl.dispose();
    expect(saves()).toHaveLength(1);
  });

  it('without a conflict it flushes the pending edits as before', async () => {
    const ctl = controller();
    ctl.queue({ title: 'Typed last' });
    await ctl.dispose();
    expect(saves()).toHaveLength(1);
    expect(saves()[0]).toMatchObject({ keepalive: true });
    expect(saves()[0].body).toEqual({ title: 'Typed last', baseRevision: 'r1' });
  });
});

describe('leaving while a save is in flight', () => {
  it('keeps what was typed after it when that save is then refused on a colliding field', async () => {
    const ctl = controller();
    let release!: (r: Response) => void;
    answers.push(
      () => new Promise<Response>((resolve) => (release = resolve)),
      () => reply(200, {})
    );
    ctl.queue({ blocks: [{ id: 'first' } as any] });
    await settle();
    ctl.queue({ blocks: [{ id: 'typed after the request left' } as any] });
    const leaving = ctl.dispose();
    // The refusal arrives only now, after leave() was called.
    release(conflictAnswer(stored('r2', rev('x', 'b1'))));
    await vi.advanceTimersByTimeAsync(5);
    await leaving;

    expect(saves()).toHaveLength(2);
    expect(saves()[1].body).toEqual({
      blocks: [{ id: 'typed after the request left' }],
      baseRevision: 'r1',
    });
    expect(calls[calls.length - 1].url).toBe('/api/pages/7/checkpoint');
  });

  it('stores what was typed after it when that save succeeds', async () => {
    const ctl = controller();
    let release!: (r: Response) => void;
    answers.push(
      () => new Promise<Response>((resolve) => (release = resolve)),
      () => savedAnswer('r3')
    );
    ctl.queue({ title: 'First' });
    await settle();
    ctl.queue({ title: 'Typed after' });
    const leaving = ctl.dispose();
    release(savedAnswer('r2'));
    await vi.advanceTimersByTimeAsync(5);
    await leaving;
    expect(saves()).toHaveLength(2);
    expect(saves()[1].body).toEqual({ title: 'Typed after', baseRevision: 'r2' });
  });

  it('keeps it when the save is silently re-based and the resend is refused again', async () => {
    const ctl = controller();
    let release!: (r: Response) => void;
    answers.push(
      () => new Promise<Response>((resolve) => (release = resolve)),
      () => conflictAnswer(stored('r3', rev('x', 'b2'))),
      () => reply(200, {})
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    ctl.queue({ title: 'Mine, typed later' });
    const leaving = ctl.dispose();
    release(conflictAnswer(stored('r2', rev('x', 'b1'))));
    await vi.advanceTimersByTimeAsync(5);
    await leaving;
    // First refusal re-based, the resend was refused again (a conflict), and the title typed since
    // went out once more on the old base so the server records it.
    expect(saves().map((c) => c.body.baseRevision)).toEqual(['r1', 'r2', 'r2']);
    expect(saves()[2].body.title).toBe('Mine, typed later');
  });
});

describe('a save that changes nothing, refused on a stale base', () => {
  it('re-bases like any refusal: the other fields are adopted before the same patch is resent', async () => {
    const ctl = controller();
    // The tags save changes nothing, but the body was saved elsewhere: the server refuses (409).
    answers.push(
      () => conflictAnswer(stored('r2', rev('x', 'b1'))),
      () => savedAnswer('r2', rev('x', 'b1'))
    );
    ctl.queue({ tags: [] });
    await settle();
    expect(events).toEqual(['fetch PUT autosave', 'adopt blocks', 'fetch PUT autosave']);
    expect(saves()[1].body).toEqual({ tags: [], baseRevision: 'r2' });
    expect(ctl.getSnapshot()).toMatchObject({ status: 'saved', conflict: null });
  });
});

describe('metadata that is not the cover', () => {
  it('is never a collision: nothing differs per field, so the re-base goes through', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('x'))),
      () => savedAnswer('r3', rev('y'))
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    expect(saves()).toHaveLength(2);
    expect(ctl.getSnapshot()).toMatchObject({ status: 'saved', conflict: null });
  });

  it('two refusals in a row for such changes open the notice with no field listed (the notice says so)', async () => {
    const ctl = controller();
    answers.push(
      () => conflictAnswer(stored('r2', rev('x'))),
      () => conflictAnswer(stored('r3', rev('x')))
    );
    ctl.queue({ title: 'Mine' });
    await settle();
    await settle(10000);
    const snapshot = ctl.getSnapshot();
    expect(snapshot.status).toBe('conflict');
    expect(snapshot.conflict?.fields).toEqual([]);
  });
});
