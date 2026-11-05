/**
 * Duplicating a page creates its copy in the source's team and under the source's parent, end to
 * end against the real server, authentication, team membership and PostgreSQL. Synthetic users,
 * teams and pages only. The route-level rules are in server/tests/page-duplicate-route.test.ts.
 *
 * Rules under test:
 * - reading a team page is not enough to copy it: the copy is a new page in that team, so the
 *   caller needs what POST /api/pages needs there (membership of the team);
 * - a copy of a child page also needs editor on the parent it would go under;
 * - a refused copy answers 403 and leaves nothing behind: no copy by slug, none in the team's
 *   page list;
 * - members of the team who may edit the parent keep copying as before.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

type Page = {
  id: number;
  slug: string;
  title: string;
  teamId: number | null;
  parentId: number | null;
};
type User = { email: string; password: string };

function pageList(body: unknown): Page[] {
  return Array.isArray(body) ? body : ((body as { pages?: Page[] })?.pages ?? []);
}

test.describe('Duplicating a page needs the rights to create its copy', () => {
  const stamp = Date.now();
  let owner: User;
  let member: User;
  let outsider: User;
  let ownerRequest: APIRequestContext;
  let memberRequest: APIRequestContext;
  let outsiderRequest: APIRequestContext;
  let team: number;
  let outsiderTeam: number;
  // A top-level page of the team, and a child page under it, both written by the owner
  let top: Page;
  let child: Page;
  const teamIds: number[] = [];
  const copies: number[] = [];

  const createPage = async (slug: string, parentId: number | null) => {
    const response = await ownerRequest.post('/api/pages', {
      data: {
        title: `Dup ${slug} ${stamp}`,
        slug: `dup-${slug}-${stamp}`,
        content: `content ${slug}`,
        folder: 'docs',
        tags: [],
        author: owner.email,
        teamId: team,
        parentId,
      },
    });
    expect(response.status(), `create ${slug}`).toBe(201);
    return (await response.json()) as Page;
  };
  const grant = async (page: Page, data: object) => {
    const response = await ownerRequest.post(`/api/pages/${page.id}/permissions`, { data });
    expect(response.status(), `grant on ${page.slug}`).toBe(201);
  };
  /** No copy of the page exists: not by its copy slug, not in the team's page list. */
  const expectNoCopy = async (page: Page) => {
    expect((await ownerRequest.get(`/api/pages/slug/${page.slug}-copy`)).status()).toBe(404);
    const listed = await ownerRequest.get(`/api/pages?teamId=${team}&limit=100`);
    expect(listed.status()).toBe(200);
    const titles = pageList(await listed.json()).map((p) => p.title);
    expect(titles).not.toContain(`${page.title} (Copy)`);
  };

  test.beforeAll(async ({ request }) => {
    owner = await registerTestUser(request, 'dup-owner');
    member = await registerTestUser(request, 'dup-member');
    outsider = await registerTestUser(request, 'dup-outsider');
    ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    memberRequest = await createAuthenticatedApiContext(member.email, member.password);
    outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);

    const createTeam = async (ctx: APIRequestContext, name: string) => {
      const response = await ctx.post('/api/teams', {
        data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
      });
      expect(response.status(), `create team ${name}`).toBe(201);
      const { id } = (await response.json()) as { id: number };
      teamIds.push(id);
      return id;
    };
    team = await createTeam(ownerRequest, 'dup-team');
    outsiderTeam = await createTeam(outsiderRequest, 'dup-outside');
    const admit = await ownerRequest.post(`/api/teams/${team}/memberships`, {
      data: { email: member.email },
    });
    expect(admit.status()).toBe(201);

    top = await createPage('top', null);
    child = await createPage('child', top.id);
    expect(child).toMatchObject({ teamId: team, parentId: top.id });
    // The outsider reads both pages without joining the team: the top page through a grant to
    // the outsider's own team, the child page through a public link.
    await grant(top, { entityType: 'team', entityId: outsiderTeam, permission: 'viewer' });
    await grant(child, { entityType: 'public', permission: 'viewer' });
  });

  test.afterAll(async () => {
    for (const id of copies) await ownerRequest?.delete(`/api/pages/${id}`).catch(() => {});
    for (const page of [child, top]) {
      if (page) await ownerRequest?.delete(`/api/pages/${page.id}`).catch(() => {});
    }
    for (const teamId of teamIds) {
      await ownerRequest?.delete(`/api/teams/${teamId}`).catch(() => {});
      await outsiderRequest?.delete(`/api/teams/${teamId}`).catch(() => {});
    }
    await ownerRequest?.dispose();
    await memberRequest?.dispose();
    await outsiderRequest?.dispose();
  });

  test('a reader outside the team cannot copy its pages into the team', async () => {
    for (const page of [top, child]) {
      expect((await outsiderRequest.get(`/api/pages/${page.id}`)).status(), page.slug).toBe(200);
      const duplicate = await outsiderRequest.post(`/api/pages/${page.id}/duplicate`);
      expect(duplicate.status(), `outsider duplicates ${page.slug}`).toBe(403);
      await expectNoCopy(page);
    }
  });

  test('a team member needs editor on the parent to copy a child page', async () => {
    // Members read every page of their team, but the owner's pages are not theirs to edit.
    expect((await memberRequest.get(`/api/pages/${child.id}`)).status()).toBe(200);
    const refused = await memberRequest.post(`/api/pages/${child.id}/duplicate`);
    expect(refused.status()).toBe(403);
    await expectNoCopy(child);

    // A top-level page needs membership only.
    const topCopy = await memberRequest.post(`/api/pages/${top.id}/duplicate`);
    expect(topCopy.status()).toBe(201);
    const topCopied = (await topCopy.json()) as Page;
    copies.push(topCopied.id);
    expect(topCopied).toMatchObject({ teamId: team, parentId: null, title: `${top.title} (Copy)` });

    // The owner may edit the parent, so the copy goes next to the child as before.
    const childCopy = await ownerRequest.post(`/api/pages/${child.id}/duplicate`);
    expect(childCopy.status()).toBe(201);
    const childCopied = (await childCopy.json()) as Page;
    copies.push(childCopied.id);
    expect(childCopied).toMatchObject({ teamId: team, parentId: top.id });
  });
});
