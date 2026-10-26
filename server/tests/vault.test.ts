/**
 * Markdown vault export and import routes (#113 P2-D2), with real routes and mocked storage:
 * scope refusals, upload limits, unsafe archives, the import plan handed to storage, and that
 * the export only writes titles the readable-link lookup returned. The SQL filtering itself
 * (readablePagesInScope) is proven against a real database by tests/security-vault.spec.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import { createZip, readZip } from '../services/zip';
import { parseFrontmatter } from '../services/vault-format';

const TEST_SECRET = 'vault-routes-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'vault-routes-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    enforceAuthForWrites: false,
    allowAdminPassword: false,
    rateLimitEnabled: false,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 1000,
    adminIpWhitelist: [],
    port: 5001,
    host: '0.0.0.0',
    isProduction: false,
    isReplit: false,
  },
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage';

const token = jwt.sign({ id: 7, email: 'member@example.com', role: 'user' }, TEST_SECRET);
const viewer = { userId: 7, email: 'member@example.com', teamIds: [3] };
const cookie = [`accessToken=${token}`];

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll((done) => {
  server.close(done);
});

const exportRow = (id: number, title: string, parentId: number | null, content = '') => ({
  id,
  title,
  slug: `p${id}`,
  icon: null,
  parentId,
  position: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
  content,
  tags: ['t'],
});

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getPageViewer as any).mockImplementation(async (userId?: number) =>
    userId ? viewer : { teamIds: [] }
  );
  (storage.getTeamByName as any).mockResolvedValue(undefined);
  (storage.getTeam as any).mockResolvedValue({ id: 3, name: 'design' });
  (storage.getVaultExportPages as any).mockResolvedValue([]);
  (storage.resolveReadablePageLinks as any).mockResolvedValue([]);
  (storage.getReadablePageTitlesInScope as any).mockResolvedValue([]);
  (storage.reservePageIds as any).mockImplementation(async (count: number) =>
    Array.from({ length: count }, (_, index) => 101 + index)
  );
  (storage.insertImportedPages as any).mockImplementation(async (input: any) =>
    input.pages.map((page: any) => ({ id: page.id, slug: page.slug }))
  );
});

/** Supertest keeps binary bodies as Buffers only with an explicit parser. */
const binary = (res: any, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const archiveFiles = (body: Buffer) =>
  new Map(
    readZip(body, { maxEntries: 500, maxTotalUncompressed: 1e8 }).map((entry) => [
      entry.name,
      entry.read().toString('utf8'),
    ])
  );

describe('GET /api/vault/export', () => {
  it('refuses a team scope without a session', async () => {
    const response = await request(app).get('/api/vault/export?teamId=3');
    expect(response.status).toBe(401);
    expect(storage.getVaultExportPages).not.toHaveBeenCalled();
  });

  it.each([
    ['a team the caller is not in', '?teamId=4'],
    ['an unknown team name', '?teamId=nope'],
  ])('refuses %s', async (_label, query) => {
    const response = await request(app).get(`/api/vault/export${query}`).set('Cookie', cookie);
    expect(response.status).toBe(403);
    expect(storage.getVaultExportPages).not.toHaveBeenCalled();
  });

  it('exports the readable pages of the team as a zip with links rewritten', async () => {
    (storage.getVaultExportPages as any).mockResolvedValue([
      exportRow(1, 'Home', null, 'See [[page:2]], [[page:40]] and [[page:41]].'),
      exportRow(2, 'Child', 1, 'Up: [[page:1]]'),
    ]);
    // Only page 40 is readable outside the export; 41 is not (the lookup leaves it out).
    (storage.resolveReadablePageLinks as any).mockResolvedValue([
      { id: 40, title: 'Elsewhere', slug: 'e', icon: null },
    ]);

    const response = await request(app)
      .get('/api/vault/export?teamId=3')
      .set('Cookie', cookie)
      .buffer(true)
      .parse(binary);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="papyrus-design-\d{4}-\d{2}-\d{2}\.zip"$/
    );
    expect(storage.getVaultExportPages).toHaveBeenCalledWith(viewer, 3);
    expect(storage.resolveReadablePageLinks).toHaveBeenCalledTimes(1);
    expect(storage.resolveReadablePageLinks).toHaveBeenCalledWith(viewer, [40, 41]);

    const files = archiveFiles(response.body);
    expect(Array.from(files.keys())).toEqual(['Home.md', 'Home/Child.md']);
    const home = parseFrontmatter(files.get('Home.md')!);
    expect(home.data).toMatchObject({ title: 'Home', tags: ['t'], papyrus_id: '1' });
    expect(home.body).toBe('See [[Child]], Elsewhere and 접근할 수 없는 페이지.\n');
    expect(parseFrontmatter(files.get('Home/Child.md')!).body).toBe('Up: [[Home]]\n');
  });

  it('exports team-less pages when no team is given', async () => {
    const response = await request(app)
      .get('/api/vault/export')
      .set('Cookie', cookie)
      .buffer(true)
      .parse(binary);
    expect(response.status).toBe(200);
    expect(storage.getVaultExportPages).toHaveBeenCalledWith(viewer, null);
    expect(storage.resolveReadablePageLinks).not.toHaveBeenCalled();
    expect(response.headers['content-disposition']).toContain('papyrus-personal-');
    expect(archiveFiles(response.body).size).toBe(0);
  });

  it('refuses a scope too large to build in one request', async () => {
    (storage.getVaultExportPages as any).mockResolvedValue(
      Array.from({ length: 20_001 }, (_, i) => exportRow(i + 1, `P${i}`, null))
    );
    const response = await request(app).get('/api/vault/export').set('Cookie', cookie);
    expect(response.status).toBe(413);
    expect(storage.resolveReadablePageLinks).not.toHaveBeenCalled();
  });

  it('does not leak internal errors', async () => {
    (storage.getVaultExportPages as any).mockRejectedValue(
      new Error('relation "secret_x" missing')
    );
    const response = await request(app).get('/api/vault/export').set('Cookie', cookie);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_x');
  });
});

describe('GET /api/pages/:id/export', () => {
  it('writes readable link targets as [[Name]] and hides the rest', async () => {
    (storage.checkPagePermission as any).mockResolvedValue(true);
    (storage.getWikiPage as any).mockResolvedValue({
      ...exportRow(5, 'Page', null, 'A [[page:6]] B [[page:7]] `[[page:7]]`'),
      author: 'member@example.com',
      folder: 'docs',
    });
    (storage.resolveReadablePageLinks as any).mockResolvedValue([
      { id: 6, title: 'Q&A: notes', slug: 'q', icon: null },
    ]);

    const response = await request(app).get('/api/pages/5/export').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(storage.resolveReadablePageLinks).toHaveBeenCalledWith(viewer, [6, 7]);
    const { data, body } = parseFrontmatter(response.text);
    expect(data).toMatchObject({ title: 'Page', slug: 'p5', papyrus_id: '5' });
    expect(body).toBe('A [[Q&A notes]] B 접근할 수 없는 페이지 `[[page:7]]`');
  });
});

describe('GET /api/pages/:id/export file names', () => {
  it.each(['markdown', 'html', 'json'])(
    'names a Korean slug in a valid, RFC 5987 encoded header (%s)',
    async (format) => {
      (storage.checkPagePermission as any).mockResolvedValue(true);
      (storage.getWikiPage as any).mockResolvedValue({
        ...exportRow(5, '회의록', null, 'body'),
        slug: '회의록-ab12',
        author: 'member@example.com',
        folder: 'docs',
      });

      const response = await request(app)
        .get(`/api/pages/5/export?format=${format}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      const disposition = response.headers['content-disposition'];
      expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
      expect(disposition).toContain(encodeURIComponent('회의록-ab12'));
    }
  );
});

describe('POST /api/vault/import', () => {
  const upload = (query = '?teamId=3') =>
    request(app).post(`/api/vault/import${query}`).set('Cookie', cookie);
  const zipOf = (entries: Array<{ name: string; data: string | Buffer }>) => createZip(entries);

  it('refuses a caller without a session', async () => {
    const response = await request(app)
      .post('/api/vault/import')
      .attach('files', Buffer.from('# A'), 'A.md');
    expect(response.status).toBe(401);
    expect(storage.insertImportedPages).not.toHaveBeenCalled();
  });

  it.each([
    ['a team the caller is not in', '?teamId=4'],
    ['an unknown team name', '?teamId=nope'],
  ])('refuses importing into %s before reading the upload', async (_label, query) => {
    const response = await upload(query).attach('files', Buffer.from('# A'), 'A.md');
    expect(response.status).toBe(403);
    expect(storage.reservePageIds).not.toHaveBeenCalled();
    expect(storage.insertImportedPages).not.toHaveBeenCalled();
  });

  it('creates the pages of a vault with hierarchy, tags, icons and links', async () => {
    (storage.getReadablePageTitlesInScope as any).mockResolvedValue([
      { id: 50, title: 'Existing' },
    ]);
    const archive = zipOf([
      { name: 'vault/', data: '' },
      {
        name: 'A.md',
        data: '---\ntitle: Alpha\ntags: [x, "#y"]\nicon: 🙂\n---\nTo [[B]] and [[Existing]] and [[Nope|gone]]',
      },
      { name: 'A/B.md', data: 'Back to [[Alpha|the top]]' },
      { name: 'Folder/C.md', data: 'C' },
      { name: 'image.png', data: Buffer.from([1, 2, 3]) },
      { name: '.obsidian/app.json', data: '{}' },
    ]);

    const response = await upload().attach('files', archive, 'vault.zip');

    expect(response.status).toBe(201);
    expect(storage.getReadablePageTitlesInScope).toHaveBeenCalledWith(viewer, 3);
    expect(storage.reservePageIds).toHaveBeenCalledWith(4);
    const input = (storage.insertImportedPages as any).mock.calls[0][0];
    expect(input).toMatchObject({
      teamId: 3,
      userId: 7,
      author: 'member@example.com',
      folder: 'docs',
    });
    expect(
      input.pages.map((page: any) => [page.id, page.title, page.parentId, page.content, page.tags])
    ).toEqual([
      [101, 'Alpha', null, 'To [[page:102]] and [[page:50]] and gone', ['x', 'y']],
      [102, 'B', 101, 'Back to [[page:101]]', []],
      [103, 'Folder', null, '', []],
      [104, 'C', 103, 'C', []],
    ]);
    expect(input.pages[0].icon).toBe('🙂');
    expect(input.pages[0].linkTargets).toEqual([102, 50]);
    expect(input.pages[1].linkTargets).toEqual([101]);
    expect(new Set(input.pages.map((page: any) => page.slug)).size).toBe(4);

    expect(response.body).toEqual({
      created: [
        { id: 101, title: 'Alpha', slug: input.pages[0].slug, parentId: null, path: 'A.md' },
        { id: 102, title: 'B', slug: input.pages[1].slug, parentId: 101, path: 'A/B.md' },
        { id: 103, title: 'Folder', slug: input.pages[2].slug, parentId: null, path: 'Folder/' },
        { id: 104, title: 'C', slug: input.pages[3].slug, parentId: 103, path: 'Folder/C.md' },
      ],
      skipped: [{ path: 'image.png', reason: 'not-markdown' }],
      unresolvedLinks: [{ path: 'A.md', target: 'Nope' }],
      unresolvedLinkCount: 1,
    });
  });

  it('imports loose Markdown files with UTF-8 names into team-less pages', async () => {
    const response = await request(app)
      .post('/api/vault/import')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('Link to [[메모]]'), '회의록.md')
      .attach('files', Buffer.from('memo'), '메모.md')
      .attach('files', Buffer.alloc(1024 * 1024 + 1, 97), 'huge.md');

    expect(response.status).toBe(201);
    const input = (storage.insertImportedPages as any).mock.calls[0][0];
    expect(input.teamId).toBeNull();
    expect(input.pages.map((page: any) => [page.title, page.content])).toEqual([
      ['메모', 'memo'],
      ['회의록', 'Link to [[page:101]]'],
    ]);
    expect(response.body.skipped).toEqual([{ path: 'huge.md', reason: 'too-large' }]);
  });

  it('answers 200 without writing when nothing can be imported', async () => {
    const response = await upload().attach('files', zipOf([{ name: 'a.png', data: 'x' }]), 'v.zip');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      created: [],
      skipped: [{ path: 'a.png', reason: 'not-markdown' }],
      unresolvedLinks: [],
      unresolvedLinkCount: 0,
    });
    expect(storage.insertImportedPages).not.toHaveBeenCalled();
  });

  it.each([
    ['a parent-directory entry', '../evil.md'],
    ['a nested parent-directory entry', 'a/../../evil.md'],
    ['an absolute entry', '/etc/evil.md'],
    ['a backslash entry', '..\\evil.md'],
    ['a drive-letter entry', 'C:/evil.md'],
  ])('refuses an archive with %s', async (_label, name) => {
    const archive = zipOf([
      { name: 'ok.md', data: 'ok' },
      { name, data: 'evil' },
    ]);
    const response = await upload().attach('files', archive, 'vault.zip');
    expect(response.status).toBe(400);
    expect(storage.reservePageIds).not.toHaveBeenCalled();
    expect(storage.insertImportedPages).not.toHaveBeenCalled();
  });

  it('keeps only the base name of a loose file', async () => {
    const response = await upload().attach('files', Buffer.from('x'), '../../evil.md');
    expect(response.status).toBe(201);
    expect(response.body.created).toEqual([
      expect.objectContaining({ title: 'evil', parentId: null, path: 'evil.md' }),
    ]);
  });

  it.each([
    [
      'an encrypted archive',
      () => {
        const zip = zipOf([{ name: 'a.md', data: 'a' }]);
        const directory = zip.readUInt32LE(zip.length - 22 + 16);
        zip.writeUInt16LE(zip.readUInt16LE(directory + 8) | 1, directory + 8);
        return zip;
      },
    ],
    [
      'a symbolic link',
      () => {
        const zip = zipOf([{ name: 'a.md', data: 'a' }]);
        const directory = zip.readUInt32LE(zip.length - 22 + 16);
        zip.writeUInt32LE((0o120777 << 16) >>> 0, directory + 38);
        return zip;
      },
    ],
    ['a damaged archive', () => Buffer.from('PK\u0003\u0004 definitely not a zip')],
  ])('refuses %s', async (_label, build) => {
    const response = await upload().attach('files', build(), 'vault.zip');
    expect(response.status).toBe(400);
    expect(storage.insertImportedPages).not.toHaveBeenCalled();
  });

  it('refuses an archive mixed with other files', async () => {
    const response = await upload()
      .attach('files', zipOf([{ name: 'a.md', data: 'a' }]), 'vault.zip')
      .attach('files', Buffer.from('b'), 'b.md');
    expect(response.status).toBe(400);
  });

  it('refuses a request that is not a multipart upload, or carries no files', async () => {
    expect((await upload().send({ files: 'x' })).status).toBe(400);
    expect((await upload().field('note', 'x')).status).toBe(400);
  });

  it('refuses an upload over 10 MB', async () => {
    const response = await upload().attach('files', Buffer.alloc(11 * 1024 * 1024), 'big.zip');
    expect(response.status).toBe(413);
    expect(storage.insertImportedPages).not.toHaveBeenCalled();
  });

  it('refuses an archive with more than 500 entries', async () => {
    const archive = zipOf(
      Array.from({ length: 501 }, (_, index) => ({ name: `n${index}.md`, data: 'x' }))
    );
    const response = await upload().attach('files', archive, 'vault.zip');
    expect(response.status).toBe(413);
  });

  it('refuses an archive over 20 MB uncompressed', async () => {
    const archive = zipOf([
      { name: 'a.md', data: Buffer.alloc(11 * 1024 * 1024, 97) },
      { name: 'b.md', data: Buffer.alloc(10 * 1024 * 1024, 98) },
    ]);
    expect(archive.length).toBeLessThan(1024 * 1024);
    const response = await upload().attach('files', archive, 'vault.zip');
    expect(response.status).toBe(413);
    expect(storage.insertImportedPages).not.toHaveBeenCalled();
  });

  it('refuses an upload without a Content-Length', async () => {
    const listener = app.listen(0);
    try {
      const { port } = listener.address() as AddressInfo;
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            port,
            method: 'POST',
            path: '/api/vault/import?teamId=3',
            headers: {
              Cookie: cookie[0],
              'Content-Type': 'multipart/form-data; boundary=x',
              'Transfer-Encoding': 'chunked',
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on('error', reject);
        req.end('--x--\r\n');
      });
      expect(status).toBe(411);
    } finally {
      listener.close();
    }
  });

  it('does not leak internal errors', async () => {
    (storage.insertImportedPages as any).mockRejectedValue(new Error('duplicate key "secret_y"'));
    const response = await upload().attach('files', Buffer.from('a'), 'a.md');
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_y');
  });
});
