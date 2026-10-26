/**
 * Daily notes (#111), end to end against the real server, authentication, team membership and
 * PostgreSQL. Synthetic users, teams and pages only.
 *
 * Invariants under test: opening a scope's note for a day, however often and however
 * concurrently, yields one page (one row in wiki_pages); a team's note is reachable only by
 * current members of that team; a personal note only by its owner; a trashed note is not
 * silently replaced; a page squatting a note's slug is never handed out.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

test.describe('Daily notes: one note per day and scope', () => {
  test('concurrent opens share one note and other teams cannot reach it', async ({ request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    // The server's UTC date is always an accepted "today", whatever the runner's time zone.
    const date = new Date().toISOString().slice(0, 10);

    const ownerA = await registerTestUser(request, 'daily-owner-a');
    const memberA = await registerTestUser(request, 'daily-member-a');
    const ownerB = await registerTestUser(request, 'daily-owner-b');
    const squatted = await registerTestUser(request, 'daily-squatted');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const squattedRequest = await createAuthenticatedApiContext(squatted.email, squatted.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const teamIds: number[] = [];
    const pageIds: number[] = [];

    const userId = async (ctx: APIRequestContext) =>
      Number((await (await ctx.get('/api/auth/me')).json()).id);
    const open = (ctx: APIRequestContext, teamId?: number | string) =>
      ctx.post('/api/pages/daily', { data: teamId === undefined ? { date } : { date, teamId } });
    const rowsWithSlug = async (slug: string) =>
      (
        await pool.query(
          `SELECT id FROM wiki_pages WHERE slug = $1 OR slug LIKE $1 || '-%' ORDER BY id`,
          [slug]
        )
      ).rows.map((row) => Number(row.id));

    try {
      const teamAResponse = await ownerARequest.post('/api/teams', {
        data: { name: `daily-team-a-${stamp}`, displayName: `Daily Team A ${stamp}` },
      });
      expect(teamAResponse.status()).toBe(201);
      const teamA = await teamAResponse.json();
      teamIds.push(teamA.id);
      const teamBResponse = await ownerBRequest.post('/api/teams', {
        data: { name: `daily-team-b-${stamp}`, displayName: `Daily Team B ${stamp}` },
      });
      expect(teamBResponse.status()).toBe(201);
      const teamB = await teamBResponse.json();
      teamIds.push(teamB.id);
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);
      const memberAUserId = Number((await admit.json()).userId);
      const ownerAUserId = await userId(ownerARequest);

      // ── 1. Personal note: two tabs at once get the same page; only one row exists ──
      const personalResponses = await Promise.all([open(ownerARequest), open(ownerARequest)]);
      const personal = await Promise.all(personalResponses.map((response) => response.json()));
      for (const response of personalResponses) expect(response.status()).toBe(200);
      expect(personal[0].page.id).toBe(personal[1].page.id);
      expect(personal.map((body) => body.created).sort()).toEqual([false, true]);
      const personalNote = personal[0].page;
      pageIds.push(personalNote.id);
      expect(personalNote).toMatchObject({
        title: date,
        slug: `daily-${date}-u${ownerAUserId}`,
        folder: 'logs',
        teamId: null,
      });
      expect(personalNote.tags).toContain('daily');
      expect(await rowsWithSlug(personalNote.slug)).toEqual([personalNote.id]);

      const reopened = await open(ownerARequest);
      expect(reopened.status()).toBe(200);
      expect(await reopened.json()).toMatchObject({
        page: { id: personalNote.id },
        created: false,
      });

      // The personal note is the owner's alone; a teammate gets their own.
      expect((await ownerARequest.get(`/api/pages/${personalNote.id}`)).status()).toBe(200);
      expect([403, 404]).toContain(
        (await memberARequest.get(`/api/pages/${personalNote.id}`)).status()
      );
      const memberPersonal = await (await open(memberARequest)).json();
      pageIds.push(memberPersonal.page.id);
      expect(memberPersonal.page.id).not.toBe(personalNote.id);
      expect(memberPersonal.page.slug).toBe(`daily-${date}-u${memberAUserId}`);

      // ── 2. Team note: owner and member at once share one page the whole team can write ──
      const teamResponses = await Promise.all([
        open(ownerARequest, teamA.id),
        open(memberARequest, teamA.id),
      ]);
      for (const response of teamResponses) expect(response.status()).toBe(200);
      const team = await Promise.all(teamResponses.map((response) => response.json()));
      expect(team[0].page.id).toBe(team[1].page.id);
      expect(team.map((body) => body.created).sort()).toEqual([false, true]);
      const teamNote = team[0].page;
      pageIds.push(teamNote.id);
      expect(teamNote).toMatchObject({ slug: `daily-${date}-t${teamA.id}`, teamId: teamA.id });
      expect(await rowsWithSlug(teamNote.slug)).toEqual([teamNote.id]);

      const byName = await open(memberARequest, teamA.name);
      expect(byName.status()).toBe(200);
      expect((await byName.json()).page.id).toBe(teamNote.id);
      for (const ctx of [ownerARequest, memberARequest]) {
        const save = await ctx.put(`/api/pages/${teamNote.id}/autosave`, {
          data: { blocks: [] },
        });
        expect(save.status()).toBe(200);
      }

      // ── 3. Another team's member cannot get or create Team A's note ──
      for (const teamParam of [teamA.id, teamA.name]) {
        const response = await open(ownerBRequest, teamParam);
        expect(response.status(), `team B → team A (${teamParam})`).toBe(403);
        expect(await response.text()).not.toContain(teamNote.slug);
      }
      for (const path of [`/api/pages/${teamNote.id}`, `/api/pages/slug/${teamNote.slug}`]) {
        expect([403, 404]).toContain((await ownerBRequest.get(path)).status());
      }
      const teamBNote = await (await open(ownerBRequest, teamB.id)).json();
      pageIds.push(teamBNote.page.id);
      expect(teamBNote.page.id).not.toBe(teamNote.id);
      expect(await rowsWithSlug(teamNote.slug)).toEqual([teamNote.id]);

      const anonymousResponse = await anonymous.post('/api/pages/daily', {
        data: { date, teamId: teamA.id },
      });
      expect(anonymousResponse.status()).toBe(401);

      // ── 4. Only today's date is accepted ──
      for (const badDate of ['2020-01-01', '2026-02-30', date.replace(/-/g, '/')]) {
        const response = await ownerARequest.post('/api/pages/daily', {
          data: { date: badDate },
        });
        expect(response.status(), badDate).toBe(400);
      }

      // ── 5. A removed member loses the team's note immediately ──
      const revoke = await ownerARequest.delete(
        `/api/teams/${teamA.id}/memberships/${memberAUserId}`
      );
      expect(revoke.status()).toBe(204);
      expect((await open(memberARequest, teamA.id)).status()).toBe(403);
      expect([403, 404]).toContain(
        (await memberARequest.get(`/api/pages/${teamNote.id}`)).status()
      );

      // ── 6. A trashed note is not replaced by a second one ──
      expect((await ownerARequest.delete(`/api/pages/${personalNote.id}`)).status()).toBe(200);
      const trashed = await open(ownerARequest);
      expect(trashed.status()).toBe(409);
      expect((await trashed.json()).code).toBe('daily_note_trashed');
      expect(await rowsWithSlug(personalNote.slug)).toEqual([personalNote.id]);
      expect((await ownerARequest.post(`/api/trash/${personalNote.id}/restore`)).ok()).toBe(true);
      const restored = await open(ownerARequest);
      expect(restored.status()).toBe(200);
      expect((await restored.json()).page.id).toBe(personalNote.id);

      // ── 7. A page squatting someone's note slug is never handed to them ──
      const squattedUserId = await userId(squattedRequest);
      const marker = `daily-squat-${stamp}`;
      const squat = await ownerBRequest.post('/api/pages', {
        data: {
          title: `Squat ${marker}`,
          slug: `daily-${date}-u${squattedUserId}`,
          content: `Squatter content ${marker}`,
          folder: 'docs',
          tags: [],
          author: ownerB.email,
        },
      });
      expect(squat.status()).toBe(201);
      const squatPage = await squat.json();
      pageIds.push(squatPage.id);
      // Even an owner grant from the squatter does not make it the user's own note.
      const grant = await ownerBRequest.post(`/api/pages/${squatPage.id}/permissions`, {
        data: { entityType: 'user', entityId: squattedUserId, permission: 'owner' },
      });
      expect(grant.status()).toBe(201);
      const squattedOpen = await open(squattedRequest);
      expect(squattedOpen.status()).toBe(409);
      const squattedText = await squattedOpen.text();
      expect(JSON.parse(squattedText).code).toBe('daily_note_unavailable');
      expect(squattedText).not.toContain(marker);
    } finally {
      if (pageIds.length > 0) {
        await pool.query('DELETE FROM wiki_pages WHERE id = ANY($1::int[])', [pageIds]);
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
      await squattedRequest.dispose();
    }
  });
});
