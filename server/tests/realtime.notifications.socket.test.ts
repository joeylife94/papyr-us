import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const TEST_JWT_SECRET = 'socket-test-secret';

function authCookieFor(userId: number, role = 'user') {
  const token = jwt.sign({ id: userId, email: `user-${userId}@test.com`, role }, TEST_JWT_SECRET);
  return `accessToken=${token}`;
}

// UI 없이 소켓 알림이 정상 브로드캐스트 되는지 검증하는 통합 테스트
describe('Realtime notifications over Socket.IO', () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;
  let ioServer: any;
  let registerRoutes: typeof import('../routes.js').registerRoutes;

  // Notifications are addressed to accounts and sockets belong to accounts (WP0a): one id space.
  // The recipient is account 4242. Account 900 exists too (its number was once a roster id) and
  // must receive nothing. The sender is account 4243. Every account is in organization 1.
  const recipientId = 4242;
  const senderId = recipientId + 1;
  const namesakeId = 900;
  const orgId = 1;
  const storageCalls: string[] = [];
  const fakeStorage: any = {
    createNotification: async (n: any) => ({ id: 1, isRead: false, ...n }),
    getUnreadNotificationCount: async (userId: number, organizationId: number) =>
      userId === recipientId && organizationId === orgId ? 1 : 0,
    getNotificationRecipientOrganizationId: async (userId: number) =>
      userId === recipientId || userId === senderId ? orgId : null,
    getUserOrganizationId: async (_userId: number) => orgId,
    getNotificationForUser: async (id: number, userId: number, organizationId: number) =>
      id === 1 && userId === recipientId && organizationId === orgId
        ? { id: 1, recipientUserId: recipientId, organizationId: orgId, isRead: false }
        : undefined,
    deleteNotification: async () => true,
    updateNotification: async (id: number, changes: any) => ({
      id,
      recipientUserId: recipientId,
      organizationId: orgId,
      isRead: false,
      ...changes,
    }),
    markNotificationAsRead: async (id: number) => ({
      id,
      recipientUserId: recipientId,
      organizationId: orgId,
      isRead: true,
    }),
    markAllNotificationsAsRead: async () => undefined,
    // The roster is not consulted any more: any call to these is recorded and fails a test.
    getMemberIdsForUser: async () => {
      storageCalls.push('getMemberIdsForUser');
      return [];
    },
    getUserIdForMember: async () => {
      storageCalls.push('getUserIdForMember');
      return null;
    },
    getMemberOrganizationId: async () => {
      storageCalls.push('getMemberOrganizationId');
      return null;
    },
  };

  const connect = async (userId: number, role = 'user') => {
    const client = Client(`${baseUrl}/collab`, {
      transports: ['polling'],
      timeout: 4000,
      reconnection: false,
      extraHeaders: { Cookie: authCookieFor(userId, role) },
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for socket connect')), 6000);
      client.on('connect', () => {
        clearTimeout(t);
        resolve();
      });
      client.on('connect_error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });
    return client;
  };

  const joinMember = (client: ReturnType<typeof Client>, memberId: number) =>
    new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for join-member ack')), 3000);
      client.emit('join-member', { memberId }, (ack: { ok: boolean; error?: string }) => {
        clearTimeout(t);
        resolve(ack);
      });
    });

  const collect = (client: ReturnType<typeof Client>, event: string) => {
    const seen: any[] = [];
    client.on(event, (payload: any) => seen.push(payload));
    return seen;
  };

  const postNotification = (asUserId: number, body: Record<string, unknown>) =>
    fetch(`${baseUrl}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: authCookieFor(asUserId) },
      body: JSON.stringify({ type: 'test', title: 't', content: 'c', ...body }),
    });

  // Negative assertions (nothing arrives) need a grace period; positive ones wait with vi.waitFor.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

  beforeAll(async () => {
    // Ensure realtime sockets are enabled for this test regardless of local .env.
    // Note: featureFlags are resolved at module import time.
    process.env.PAPYR_MODE = 'team';
    process.env.FEATURE_NOTIFICATIONS = '1';
    process.env.FEATURE_COLLABORATION = '0';
    process.env.COLLAB_REQUIRE_AUTH = '1';
    process.env.ENFORCE_AUTH_WRITES = 'true';
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    vi.resetModules();
    ({ registerRoutes } = await import('../routes.js'));

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const reg = await registerRoutes(app, fakeStorage);
    ioServer = reg.io;
    server = reg.httpServer;
    if (!reg.io) {
      throw new Error('Test setup error: Socket.IO was not initialized (reg.io is undefined)');
    }
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Sanity check: make sure notifications are actually enabled in this test instance.
    const flagsRes = await fetch(`${baseUrl}/api/features`);
    const flags = await flagsRes.json();
    if (!flags?.FEATURE_NOTIFICATIONS) {
      throw new Error(
        `Test setup error: FEATURE_NOTIFICATIONS is disabled (got ${JSON.stringify(flags)})`
      );
    }
    // The hook imports the whole route module graph and starts a server; under a full parallel
    // run that alone can pass the default 10 s, so it gets the same headroom as afterAll.
  }, 30000);

  afterAll(async () => {
    // fetch keeps connections alive, which would hold close() open
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 15000);

  const roomsOf = (client: ReturnType<typeof Client>) =>
    [...(ioServer.of('/collab').sockets.get(client.id)?.rooms ?? [])].sort();

  it('emits notification:new and the unread count to the recipient account room only', async () => {
    const recipient = await connect(recipientId);
    const namesake = await connect(namesakeId);
    const adminBystander = await connect(recipientId + 7, 'admin');
    try {
      const seen = collect(recipient, 'notification:new');
      const count = collect(recipient, 'notification:unread-count');
      const namesakeSeen = collect(namesake, 'notification:new');
      const namesakeCount = collect(namesake, 'notification:unread-count');
      const bystanderSeen = collect(adminBystander, 'notification:new');

      const res = await postNotification(senderId, { recipientUserId: recipientId });
      expect(res.status).toBe(201);
      await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 8000 });
      await vi.waitFor(() => expect(count).toHaveLength(1), { timeout: 8000 });
      await settle();

      expect(seen[0]).toMatchObject({
        recipientUserId: recipientId,
        senderUserId: senderId,
        organizationId: orgId,
      });
      expect(count).toEqual([{ recipientUserId: recipientId, count: 1 }]);
      expect(namesakeSeen).toHaveLength(0);
      expect(namesakeCount).toHaveLength(0);
      expect(bystanderSeen).toHaveLength(0);
      expect(storageCalls).toEqual([]);
    } finally {
      recipient.close();
      namesake.close();
      adminBystander.close();
    }
  }, 20000);

  it('a request that names a roster id creates nothing and emits nothing', async () => {
    const recipient = await connect(recipientId);
    const namesake = await connect(namesakeId);
    try {
      const seen = collect(recipient, 'notification:new');
      const namesakeSeen = collect(namesake, 'notification:new');
      const created = vi.spyOn(fakeStorage, 'createNotification');
      const res = await postNotification(senderId, { recipientId: namesakeId });
      expect(res.status).toBe(400);
      await settle();
      expect(created).not.toHaveBeenCalled();
      expect(seen).toHaveLength(0);
      expect(namesakeSeen).toHaveLength(0);
      created.mockRestore();
    } finally {
      recipient.close();
      namesake.close();
    }
  }, 15000);

  it('tells only the deleting account about a deletion', async () => {
    const owner = await connect(recipientId);
    const other = await connect(recipientId + 1);
    try {
      const ownerSeen = collect(owner, 'notification:deleted');
      const ownerCount = collect(owner, 'notification:unread-count');
      const otherSeen = collect(other, 'notification:deleted');
      const otherCount = collect(other, 'notification:unread-count');
      const res = await fetch(`${baseUrl}/api/notifications/1`, {
        method: 'DELETE',
        headers: { Cookie: authCookieFor(recipientId) },
      });
      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(ownerSeen).toHaveLength(1), { timeout: 8000 });
      await settle();
      expect(ownerSeen).toEqual([{ id: 1 }]);
      expect(ownerCount).toEqual([{ recipientUserId: recipientId, count: 1 }]);
      expect(otherSeen).toHaveLength(0);
      expect(otherCount).toHaveLength(0);
    } finally {
      owner.close();
      other.close();
    }
  }, 15000);

  describe('join-member', () => {
    it('accepts the account own id without joining any additional room', async () => {
      const owner = await connect(recipientId);
      try {
        const before = roomsOf(owner);
        expect(before).toContain(`user:${recipientId}`);
        expect(await joinMember(owner, recipientId)).toEqual({ ok: true });
        expect(roomsOf(owner)).toEqual(before);
      } finally {
        owner.close();
      }
    });

    it('refuses any other id, joining nothing and without asking storage about the roster', async () => {
      const other = await connect(recipientId + 1);
      try {
        const before = roomsOf(other);
        expect(await joinMember(other, recipientId)).toEqual({ ok: false, error: 'Forbidden' });
        expect(await joinMember(other, namesakeId)).toEqual({ ok: false, error: 'Forbidden' });
        expect(roomsOf(other)).toEqual(before);
        expect(storageCalls).toEqual([]);
      } finally {
        other.close();
      }
    });

    it('a token with role admin gets no room beyond its own', async () => {
      const admin = await connect(recipientId + 5, 'admin');
      try {
        const before = roomsOf(admin);
        expect(await joinMember(admin, recipientId)).toEqual({ ok: false, error: 'Forbidden' });
        expect(await joinMember(admin, namesakeId)).toEqual({ ok: false, error: 'Forbidden' });
        expect(roomsOf(admin)).toEqual(before);
      } finally {
        admin.close();
      }
    });
  });

  const reachesOnlyRecipient = async (
    events: string[],
    act: () => Promise<Response>,
    expected: Record<string, any[]>
  ) => {
    const owner = await connect(recipientId);
    const namesake = await connect(namesakeId);
    const other = await connect(recipientId + 1);
    const admin = await connect(recipientId + 7, 'admin');
    try {
      const seen = new Map<string, Record<string, any[]>>();
      const watch = (name: string, client: ReturnType<typeof Client>) => {
        const byEvent: Record<string, any[]> = {};
        for (const event of events) byEvent[event] = collect(client, event);
        seen.set(name, byEvent);
      };
      watch('owner', owner);
      watch('namesake', namesake);
      watch('other', other);
      watch('admin', admin);
      const res = await act();
      expect(res.status).toBe(200);
      for (const event of events) {
        await vi.waitFor(
          () => expect(seen.get('owner')![event]).toHaveLength(expected[event].length),
          {
            timeout: 8000,
          }
        );
      }
      await settle();
      for (const event of events) {
        expect(seen.get('owner')![event], `owner ${event}`).toEqual(expected[event]);
        for (const name of ['namesake', 'other', 'admin']) {
          expect(seen.get(name)![event], `${name} ${event}`).toHaveLength(0);
        }
      }
    } finally {
      owner.close();
      namesake.close();
      other.close();
      admin.close();
    }
  };

  it('PUT reaches only the recipient account', async () => {
    await reachesOnlyRecipient(
      ['notification:updated', 'notification:unread-count'],
      () =>
        fetch(`${baseUrl}/api/notifications/1`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Cookie: authCookieFor(recipientId) },
          body: JSON.stringify({ title: 'renamed' }),
        }),
      {
        'notification:updated': [
          {
            id: 1,
            recipientUserId: recipientId,
            organizationId: orgId,
            isRead: false,
            title: 'renamed',
          },
        ],
        'notification:unread-count': [{ recipientUserId: recipientId, count: 1 }],
      }
    );
  }, 20000);

  it('PATCH read reaches only the recipient account', async () => {
    await reachesOnlyRecipient(
      ['notification:updated', 'notification:unread-count'],
      () =>
        fetch(`${baseUrl}/api/notifications/1/read`, {
          method: 'PATCH',
          headers: { Cookie: authCookieFor(recipientId) },
        }),
      {
        'notification:updated': [
          { id: 1, recipientUserId: recipientId, organizationId: orgId, isRead: true },
        ],
        'notification:unread-count': [{ recipientUserId: recipientId, count: 1 }],
      }
    );
  }, 20000);

  it('read-all reaches only the caller account, with one unread count', async () => {
    await reachesOnlyRecipient(
      ['notification:unread-count'],
      () =>
        fetch(`${baseUrl}/api/notifications/read-all`, {
          method: 'PATCH',
          headers: { Cookie: authCookieFor(recipientId) },
        }),
      { 'notification:unread-count': [{ recipientUserId: recipientId, count: 1 }] }
    );
  }, 20000);
});
