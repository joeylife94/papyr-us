/**
 * Realtime collaboration follows team membership while a session is open, end to end against the
 * real server, authentication, Socket.IO and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Rule under test: when a member is removed from a team, their open realtime sessions on the
 * team's pages lose access at once (Yjs and the legacy /collab channel): they are told so, and
 * they neither receive nor send edits any more. Before the removal, both directions work.
 *
 * Realtime collaboration is feature-flagged off by default. Run this spec against a server started
 * with FEATURE_COLLABORATION=true; otherwise it is skipped.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const SILENCE_MS = 1500;

async function accessToken(ctx: APIRequestContext): Promise<string> {
  const cookie = (await ctx.storageState()).cookies.find((c) => c.name === 'accessToken');
  expect(cookie, 'login sets an accessToken cookie').toBeTruthy();
  return cookie!.value;
}

function connect(baseURL: string, namespace: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${baseURL}${namespace}`, {
      transports: ['websocket'],
      extraHeaders: { cookie: `accessToken=${token}` },
      reconnection: false,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** The next `event` on `socket`, or null if none arrives within `ms`. */
function next<T = any>(socket: Socket, event: string, ms = 5000): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

function yjsUpdate(text: string): string {
  const doc = new Y.Doc();
  doc.getText('spec').insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
}

test.describe('Realtime collaboration follows current team membership', () => {
  test('a removed member loses their open realtime sessions at once', async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const flags = await (await request.get('/api/features')).json();
    test.skip(!flags.FEATURE_COLLABORATION, 'FEATURE_COLLABORATION is disabled on this server');

    const stamp = Date.now();
    const owner = await registerTestUser(request, 'car-owner');
    const member = await registerTestUser(request, 'car-member');
    const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    const memberRequest = await createAuthenticatedApiContext(member.email, member.password);
    const sockets: Socket[] = [];
    let teamId: number | undefined;

    try {
      const teamResponse = await ownerRequest.post('/api/teams', {
        data: { name: `car-team-${stamp}`, displayName: `CAR Team ${stamp}` },
      });
      expect(teamResponse.status()).toBe(201);
      teamId = Number((await teamResponse.json()).id);
      const admit = await ownerRequest.post(`/api/teams/${teamId}/memberships`, {
        data: { email: member.email },
      });
      expect(admit.status()).toBe(201);
      const memberUserId = Number((await admit.json()).userId);

      const created = await ownerRequest.post('/api/pages', {
        data: {
          title: `Shared page ${stamp}`,
          slug: `car-${stamp}`,
          content: 'seed',
          folder: 'docs',
          author: owner.email,
          teamId,
        },
      });
      expect(created.status()).toBe(201);
      const pageId = Number((await created.json()).id);
      // The member edits the page through an explicit grant, which counts while they are a member.
      const grant = await ownerRequest.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'user', entityId: memberUserId, permission: 'editor' },
      });
      expect(grant.status()).toBe(201);

      const ownerToken = await accessToken(ownerRequest);
      const memberToken = await accessToken(memberRequest);
      const ownerYjs = await connect(baseURL!, '/yjs', ownerToken);
      const memberYjs = await connect(baseURL!, '/yjs', memberToken);
      const ownerCollab = await connect(baseURL!, '/collab', ownerToken);
      const memberCollab = await connect(baseURL!, '/collab', memberToken);
      sockets.push(ownerYjs, memberYjs, ownerCollab, memberCollab);

      const documentId = `page-${pageId}`;
      for (const socket of [ownerYjs, memberYjs]) {
        const init = next(socket, 'yjs:init');
        socket.emit('yjs:join', { documentId, pageId });
        expect(await init, 'yjs:init').toMatchObject({ canEdit: true });
      }
      for (const socket of [ownerCollab, memberCollab]) {
        const users = next(socket, 'session-users');
        socket.emit('join-document', { pageId, userName: 'spec' });
        expect(await users, 'session-users').not.toBeNull();
      }

      // ── 1. Before the removal, edits flow both ways on both channels ──
      let received = next(ownerYjs, 'yjs:update');
      memberYjs.emit('yjs:update', { documentId, update: yjsUpdate(`member ${stamp}`) });
      expect(await received, 'owner receives the member Yjs update').not.toBeNull();
      received = next(memberYjs, 'yjs:update');
      ownerYjs.emit('yjs:update', { documentId, update: yjsUpdate(`owner ${stamp}`) });
      expect(await received, 'member receives the owner Yjs update').not.toBeNull();

      const change = { pageId, blockId: 'b1', type: 'update', data: { text: 'x' } };
      received = next(ownerCollab, 'document-change');
      memberCollab.emit('document-change', change);
      expect(await received, 'owner receives the member change').not.toBeNull();
      received = next(memberCollab, 'document-change');
      ownerCollab.emit('document-change', change);
      expect(await received, 'member receives the owner change').not.toBeNull();

      // ── 2. Removing the member closes their open sessions ──
      const yjsRevoked = next(memberYjs, 'yjs:error');
      const collabRevoked = next(memberCollab, 'collab:error');
      const revoke = await ownerRequest.delete(`/api/teams/${teamId}/memberships/${memberUserId}`);
      expect(revoke.status()).toBe(204);
      expect((await memberRequest.get(`/api/pages/${pageId}`)).status()).toBe(403);

      // The member neither sends nor receives edits any more, on either channel.
      let silent = next(ownerYjs, 'yjs:update', SILENCE_MS);
      memberYjs.emit('yjs:update', { documentId, update: yjsUpdate(`after removal ${stamp}`) });
      expect.soft(await silent, 'owner receives a Yjs update from the removed member').toBeNull();
      silent = next(memberYjs, 'yjs:update', SILENCE_MS);
      ownerYjs.emit('yjs:update', { documentId, update: yjsUpdate(`owner later ${stamp}`) });
      expect.soft(await silent, 'removed member receives a Yjs update').toBeNull();
      silent = next(ownerCollab, 'document-change', SILENCE_MS);
      memberCollab.emit('document-change', change);
      expect.soft(await silent, 'owner receives a change from the removed member').toBeNull();
      silent = next(memberCollab, 'document-change', SILENCE_MS);
      ownerCollab.emit('document-change', change);
      expect.soft(await silent, 'removed member receives a change').toBeNull();

      // ── 3. The member is told, and cannot join again ──
      expect(await yjsRevoked).toMatchObject({ code: 'ACCESS_REVOKED' });
      expect(await collabRevoked).toMatchObject({ code: 'ACCESS_REVOKED' });
      const rejoin = next(memberYjs, 'yjs:error');
      memberYjs.emit('yjs:join', { documentId, pageId });
      expect(await rejoin).toMatchObject({ code: 'PERMISSION_DENIED' });
    } finally {
      for (const socket of sockets) socket.disconnect();
      if (teamId) await ownerRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      await ownerRequest.dispose();
      await memberRequest.dispose();
    }
  });
});
