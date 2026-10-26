/**
 * Markdown vault export and import (#113 P2-D2) against the real server, authentication, team
 * membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Invariants under test:
 * - GET /api/vault/export returns only live pages the caller can read, from one scope it may use
 *   (401 without a session for a team, 403 for a team the caller is not in);
 * - a link to a page the caller cannot read is written as "접근할 수 없는 페이지", never with
 *   its title; a readable page outside the export is written as its plain title;
 * - POST /api/vault/import needs a session and membership of the target team (403 otherwise,
 *   nothing created); imported pages carry the importer's owner grant and stay in the scope;
 * - imported links resolve only to pages of the import or readable pages of the same scope,
 *   never to an unreadable page with a matching title;
 * - unsafe archives (path traversal) and oversized uploads are refused without creating pages.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';
import { createZip, readZip } from '../server/services/zip';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const INACCESSIBLE = '접근할 수 없는 페이지';

function unzip(body: Buffer): Map<string, string> {
  return new Map(
    readZip(body, { maxEntries: 5000, maxTotalUncompressed: 200 * 1024 * 1024 })
      .filter((entry) => !entry.isDirectory)
      .map((entry) => [entry.name, entry.read().toString('utf8')])
  );
}

test.describe('Vault export and import access control', () => {
  test('export and import stay inside what the caller can read and write', async ({ request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const marker = `secvault${stamp}`;

    const ownerA = await registerTestUser(request, 'vault-owner-a');
    const memberA = await registerTestUser(request, 'vault-member-a');
    const ownerB = await registerTestUser(request, 'vault-owner-b');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const created: Array<{ ctx: APIRequestContext; id: number }> = [];
    const teamIds: number[] = [];
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const mustCreate = async (
      ctx: APIRequestContext,
      title: string,
      content: string,
      extra: { teamId?: number; parentId?: number } = {}
    ) => {
      const response = await ctx.post('/api/pages', {
        data: {
          title,
          slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
          content,
          folder: 'docs',
          tags: ['vault-sec'],
          author: 'ignored',
          ...extra,
        },
      });
      expect(response.status(), `create ${title}`).toBe(201);
      const page = (await response.json()) as { id: number; slug: string };
      created.push({ ctx, id: page.id });
      return page;
    };
    const makeTeam = async (ctx: APIRequestContext, name: string) => {
      const response = await ctx.post('/api/teams', {
        data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
      });
      expect(response.status()).toBe(201);
      const team = await response.json();
      teamIds.push(team.id);
      return team as { id: number; name: string };
    };
    const exportOf = async (ctx: APIRequestContext, teamId?: number) => {
      const response = await ctx.get(`/api/vault/export${teamId ? `?teamId=${teamId}` : ''}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('application/zip');
      const body = await response.body();
      return { body, files: unzip(body) };
    };
    const importInto = (ctx: APIRequestContext, teamId: number | null, archive: Buffer) =>
      ctx.post(`/api/vault/import${teamId ? `?teamId=${teamId}` : ''}`, {
        multipart: { files: { name: 'vault.zip', mimeType: 'application/zip', buffer: archive } },
      });
    const pageCountWithMarker = async (text: string) =>
      Number(
        (await pool.query('SELECT count(*) FROM wiki_pages WHERE title LIKE $1', [`%${text}%`]))
          .rows[0].count
      );

    try {
      // ── Arrange: team A (ownerA + memberA), team B (ownerB) ──
      const teamA = await makeTeam(ownerARequest, 'vault-a');
      const teamB = await makeTeam(ownerBRequest, 'vault-b');
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);
      const ownerAId = Number((await (await ownerARequest.get('/api/auth/me')).json()).id);

      const secretB = await mustCreate(ownerBRequest, `Secret B ${marker}`, 'team B only', {
        teamId: teamB.id,
      });
      // Team-less and created with an owner grant: private to ownerB.
      const privateB = await mustCreate(ownerBRequest, `Private B ${marker}`, 'ownerB only');
      const personalA = await mustCreate(ownerARequest, `Personal A ${marker}`, 'mine');
      const rootA = await mustCreate(
        ownerARequest,
        `Root A ${marker}`,
        [
          `Team B: [[page:${secretB.id}]]`,
          `Private: [[page:${privateB.id}]]`,
          `Mine: [[page:${personalA.id}]]`,
        ].join('\n'),
        { teamId: teamA.id }
      );
      const childA = await mustCreate(
        ownerARequest,
        `Child A ${marker}`,
        `Up: [[page:${rootA.id}]]`,
        {
          teamId: teamA.id,
          parentId: rootA.id,
        }
      );

      // ── 1. Export is scoped ──
      expect((await anonymous.get(`/api/vault/export?teamId=${teamA.id}`)).status()).toBe(401);
      const refused = await ownerBRequest.get(`/api/vault/export?teamId=${teamA.id}`);
      expect(refused.status()).toBe(403);
      expect(await refused.text()).not.toContain(marker);

      // ── 2. Team A's export: its pages only, unreadable titles never written ──
      for (const ctx of [ownerARequest, memberARequest]) {
        const { body, files } = await exportOf(ctx, teamA.id);
        const names = Array.from(files.keys());
        expect(names).toContain(`Root A ${marker}.md`);
        expect(names).toContain(`Root A ${marker}/Child A ${marker}.md`);
        expect(names.some((name) => name.includes('Secret B') || name.includes('Private B'))).toBe(
          false
        );
        const all = Array.from(files.values()).join('\n');
        expect(all).not.toContain('Secret B');
        expect(all).not.toContain('Private B');
        expect(all).not.toContain('team B only');
        expect(body.includes(Buffer.from('Secret B'))).toBe(false);
        expect(body.includes(Buffer.from('Private B'))).toBe(false);
        const root = files.get(`Root A ${marker}.md`)!;
        expect(root).toContain(`papyrus_id: "${rootA.id}"`);
        expect(root).toContain(`Team B: ${INACCESSIBLE}`);
        expect(root).toContain(`Private: ${INACCESSIBLE}`);
        // ownerA can read their personal page; memberA cannot.
        expect(root).toContain(
          ctx === ownerARequest ? `Mine: Personal A ${marker}` : `Mine: ${INACCESSIBLE}`
        );
        expect(files.get(`Root A ${marker}/Child A ${marker}.md`)).toContain(
          `Up: [[Root A ${marker}]]`
        );
      }

      // ── 3. Personal export: the caller's team-less pages, not other users' private ones ──
      const personal = await exportOf(ownerARequest);
      expect(personal.files.has(`Personal A ${marker}.md`)).toBe(true);
      expect(Array.from(personal.files.values()).join('\n')).not.toContain('Private B');
      expect(Array.from(personal.files.values()).join('\n')).not.toContain(`Root A ${marker}`);

      // ── 4. Single-page export uses the same link rules ──
      const single = await ownerARequest.get(`/api/pages/${rootA.id}/export?format=markdown`);
      expect(single.status()).toBe(200);
      const singleText = await single.text();
      expect(singleText).not.toContain('Secret B');
      expect(singleText).not.toContain('Private B');
      expect(singleText).toContain(`Mine: [[Personal A ${marker}]]`);
      expect(singleText).toContain(`Team B: ${INACCESSIBLE}`);

      // ── 5. Import refusals create nothing ──
      const vault = createZip([
        {
          name: `Imported ${marker}.md`,
          data: [
            `---\ntitle: Imported ${marker}\ntags: [imported]\n---`,
            `Existing: [[Root A ${marker}]]`,
            `Guess: [[Secret B ${marker}]]`,
            `Guess private: [[Private B ${marker}]]`,
            `Sibling: [[Sub ${marker}]]`,
          ].join('\n'),
        },
        { name: `Imported ${marker}/Sub ${marker}.md`, data: 'sub' },
      ]);
      expect((await importInto(anonymous, teamA.id, vault)).status()).toBe(401);
      const outsider = await importInto(ownerARequest, teamB.id, vault);
      expect(outsider.status()).toBe(403);
      expect(await pageCountWithMarker(`Imported ${marker}`)).toBe(0);

      const traversal = await importInto(
        ownerARequest,
        teamA.id,
        createZip([
          { name: `ok ${marker}.md`, data: 'ok' },
          { name: '../escape.md', data: 'evil' },
        ])
      );
      expect(traversal.status()).toBe(400);
      expect(await pageCountWithMarker(`ok ${marker}`)).toBe(0);

      const oversized = await ownerARequest.post(`/api/vault/import?teamId=${teamA.id}`, {
        multipart: {
          files: {
            name: 'big.zip',
            mimeType: 'application/zip',
            buffer: Buffer.alloc(11 * 1024 * 1024),
          },
        },
      });
      expect(oversized.status()).toBe(413);

      // ── 6. A real import: scoped, owned by the importer, links only to readable pages ──
      const imported = await importInto(ownerARequest, teamA.id, vault);
      expect(imported.status()).toBe(201);
      const summary = await imported.json();
      for (const page of summary.created) created.push({ ctx: ownerARequest, id: page.id });
      expect(summary.created.map((page: { title: string }) => page.title)).toEqual([
        `Imported ${marker}`,
        `Sub ${marker}`,
      ]);
      expect(JSON.stringify(summary)).not.toContain('team B only');
      expect(summary.unresolvedLinks.map((link: { target: string }) => link.target)).toEqual([
        `Secret B ${marker}`,
        `Private B ${marker}`,
      ]);
      const [importedRoot, importedSub] = summary.created as Array<{ id: number; slug: string }>;
      const rows = (
        await pool.query(
          'SELECT id, team_id, parent_id, content, tags, blocks FROM wiki_pages WHERE id = ANY($1) ORDER BY id',
          [[importedRoot.id, importedSub.id]]
        )
      ).rows;
      expect(rows.map((row) => [row.team_id, row.parent_id])).toEqual([
        [teamA.id, null],
        [teamA.id, importedRoot.id],
      ]);
      expect(rows[0].tags).toEqual(['imported']);
      expect(rows[0].blocks).toEqual([]);
      expect(rows[0].content).toContain(`Existing: [[page:${rootA.id}]]`);
      expect(rows[0].content).toContain(`Guess: Secret B ${marker}`);
      expect(rows[0].content).toContain(`Sibling: [[page:${importedSub.id}]]`);
      expect(rows[0].content).not.toContain(`[[page:${secretB.id}]]`);
      expect(rows[0].content).not.toContain(`[[page:${privateB.id}]]`);
      const grants = (
        await pool.query(
          "SELECT page_id, entity_id FROM page_permissions WHERE page_id = ANY($1) AND entity_type = 'user' AND permission = 'owner' ORDER BY page_id",
          [[importedRoot.id, importedSub.id]]
        )
      ).rows;
      expect(grants.map((grant) => [grant.page_id, grant.entity_id])).toEqual([
        [importedRoot.id, ownerAId],
        [importedSub.id, ownerAId],
      ]);
      const links = (
        await pool.query(
          'SELECT target_page_id FROM page_links WHERE source_page_id = $1 ORDER BY target_page_id',
          [importedRoot.id]
        )
      ).rows.map((row) => row.target_page_id);
      expect(links).toEqual([rootA.id, importedSub.id].sort((a, b) => a - b));
      // Team members read the imported team page; outsiders do not.
      expect((await memberARequest.get(`/api/pages/${importedRoot.id}`)).status()).toBe(200);
      expect((await ownerBRequest.get(`/api/pages/${importedRoot.id}`)).status()).toBe(403);

      // ── 7. A personal import is private to the importer ──
      const personalImport = await importInto(
        ownerARequest,
        null,
        createZip([{ name: `Mine imported ${marker}.md`, data: 'private' }])
      );
      expect(personalImport.status()).toBe(201);
      const personalPage = (await personalImport.json()).created[0] as { id: number };
      created.push({ ctx: ownerARequest, id: personalPage.id });
      expect((await ownerARequest.get(`/api/pages/${personalPage.id}`)).status()).toBe(200);
      expect((await ownerBRequest.get(`/api/pages/${personalPage.id}`)).status()).toBe(403);
      expect(Array.from((await exportOf(ownerBRequest)).files.keys()).join('\n')).not.toContain(
        `Mine imported ${marker}`
      );
      void childA;
    } finally {
      for (const { ctx, id } of created.reverse()) {
        await ctx.delete(`/api/pages/${id}`).catch(() => {});
        await ctx.delete(`/api/trash/${id}`).catch(() => {});
      }
      for (const teamId of teamIds) {
        await ownerARequest.delete(`/api/teams/${teamId}`).catch(() => {});
        await ownerBRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await pool.end();
      await anonymous.dispose();
      await ownerARequest.dispose();
      await memberARequest.dispose();
      await ownerBRequest.dispose();
    }
  });
});
