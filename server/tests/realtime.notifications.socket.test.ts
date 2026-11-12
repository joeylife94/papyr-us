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
  let registerRoutes: typeof import('../routes.js').registerRoutes;

  // 테스트용 storage 더미 구현
  // Notifications address members, sockets belong to accounts (#124 X1b). The account `recipientId`
  // owns member row 900 (same email); account 900 exists too and owns no member row, so a member id
  // that equals a user id must not reach that user.
  const recipientId = 4242;
  const recipientMemberId = 900;
  // Member row 901 sits in the caller's organization through its team but has no account.
  const memberWithoutAccount = 901;
  const memberToUser = new Map<number, number>([[recipientMemberId, recipientId]]);
  const fakeStorage: any = {
    createNotification: async (n: any) => ({ id: 1, isRead: false, ...n }),
    getUnreadNotificationCount: async (memberIds: number[]) => (memberIds.length ? 1 : 0),
    getMemberIdsForUser: async (userId: number) =>
      [...memberToUser].filter(([, u]) => u === userId).map(([m]) => m),
    getUserIdForMember: async (memberId: number) => memberToUser.get(memberId) ?? null,
    getMemberOrganizationId: async (memberId: number) =>
      memberToUser.has(memberId) || memberId === memberWithoutAccount ? 1 : null,
    getUserOrganizationId: async (_userId: number) => 1,
    getNotificationForUser: async (id: number, userId: number) =>
      id === 1 && userId === recipientId
        ? { id: 1, recipientId: recipientMemberId, isRead: false }
        : undefined,
    deleteNotification: async () => true,
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

  it('emits notification:new to the authenticated user room when a notification is created', async () => {
    const nsUrl = `${baseUrl}/collab`;
    const client = Client(nsUrl, {
      transports: ['polling'],
      timeout: 4000,
      reconnection: false,
      extraHeaders: {
        Cookie: authCookieFor(recipientId),
      },
    });

    try {
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

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for join-member ack')), 3000);
        client.emit('join-member', { memberId: recipientId }, () => {
          clearTimeout(t);
          resolve();
        });
      });

      const received = new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for notification:new')), 8000);
        client.on('notification:new', (payload: any) => {
          try {
            if (payload?.recipientId === recipientMemberId) {
              clearTimeout(t);
              resolve();
            }
          } catch (e) {
            clearTimeout(t);
            reject(e);
          }
        });
        client.on('connect_error', (err) => {
          clearTimeout(t);
          reject(err);
        });
      });

      const res = await fetch(`${baseUrl}/api/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookieFor(recipientId),
        },
        body: JSON.stringify({
          type: 'test',
          title: 't',
          content: 'c',
          recipientId: recipientMemberId,
        }),
      });
      if (!res.ok) throw new Error(`create notif failed: ${res.status}`);

      await expect(received).resolves.toBeUndefined();
    } finally {
      client.close();
    }
  }, 15000);

  it("rejects joining another user's notification room", async () => {
    const nsUrl = `${baseUrl}/collab`;
    const intruderId = recipientId + 1;
    const client = Client(nsUrl, {
      transports: ['polling'],
      timeout: 4000,
      reconnection: false,
      extraHeaders: {
        Cookie: authCookieFor(intruderId),
      },
    });

    try {
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

      const joinResult = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for join-member ack')), 3000);
        client.emit(
          'join-member',
          { memberId: recipientId },
          (ack: { ok: boolean; error?: string }) => {
            clearTimeout(t);
            resolve(ack);
          }
        );
      });

      expect(joinResult).toEqual({ ok: false, error: 'Forbidden' });
    } finally {
      client.close();
    }
  }, 15000);

  it('refuses a token with role admin that asks to join another id', async () => {
    const admin = await connect(recipientId + 5, 'admin');
    try {
      expect(await joinMember(admin, recipientId)).toEqual({ ok: false, error: 'Forbidden' });
      expect(await joinMember(admin, recipientMemberId)).toEqual({ ok: false, error: 'Forbidden' });
    } finally {
      admin.close();
    }
  }, 15000);

  it("delivers a notification for member M to the account with M's email, not to user #M", async () => {
    const owner = await connect(recipientId);
    const namesake = await connect(recipientMemberId); // users.id equals the member id
    const adminBystander = await connect(recipientId + 7, 'admin');
    try {
      const ownerSeen = collect(owner, 'notification:new');
      const namesakeSeen = collect(namesake, 'notification:new');
      const bystanderSeen = collect(adminBystander, 'notification:new');
      const ownerCount = collect(owner, 'notification:unread-count');
      const namesakeCount = collect(namesake, 'notification:unread-count');

      const res = await postNotification(recipientId, { recipientId: recipientMemberId });
      expect(res.status).toBe(201);
      await settle();

      expect(ownerSeen).toHaveLength(1);
      expect(ownerSeen[0].recipientId).toBe(recipientMemberId);
      expect(ownerCount).toEqual([{ recipientId: recipientMemberId, count: 1 }]);
      expect(namesakeSeen).toHaveLength(0);
      expect(namesakeCount).toHaveLength(0);
      expect(bystanderSeen).toHaveLength(0);
    } finally {
      owner.close();
      namesake.close();
      adminBystander.close();
    }
  }, 20000);

  it('emits nothing for a recipient member row that has no account', async () => {
    const owner = await connect(recipientId);
    try {
      const seen = collect(owner, 'notification:new');
      const res = await postNotification(recipientId, { recipientId: memberWithoutAccount });
      expect(res.status).toBe(201);
      await settle();
      expect(seen).toHaveLength(0);
    } finally {
      owner.close();
    }
  }, 15000);

  it('tells only the deleting account about a deletion', async () => {
    const owner = await connect(recipientId);
    const other = await connect(recipientId + 1);
    try {
      const ownerSeen = collect(owner, 'notification:deleted');
      const otherSeen = collect(other, 'notification:deleted');
      const res = await fetch(`${baseUrl}/api/notifications/1`, {
        method: 'DELETE',
        headers: { Cookie: authCookieFor(recipientId) },
      });
      expect(res.status).toBe(200);
      await settle();
      expect(ownerSeen).toEqual([{ id: 1 }]);
      expect(otherSeen).toHaveLength(0);
    } finally {
      owner.close();
      other.close();
    }
  }, 15000);
});
