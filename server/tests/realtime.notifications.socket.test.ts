import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client } from 'socket.io-client';

// UI 없이 소켓 알림이 정상 브로드캐스트 되는지 검증하는 통합 테스트
describe('Realtime notifications over Socket.IO', () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;
  let registerRoutes: typeof import('../routes.js').registerRoutes;

  // 테스트용 storage 더미 구현
  const recipientId = 4242;
  const fakeStorage: any = {
    createNotification: async (n: any) => ({ id: 1, isRead: false, ...n }),
    getUnreadNotificationCount: async (_rid: number) => 1,
  };

  beforeAll(async () => {
    // Ensure realtime sockets are enabled for this test regardless of local .env.
    // Note: featureFlags are resolved at module import time.
    process.env.PAPYR_MODE = 'team';
    process.env.FEATURE_NOTIFICATIONS = '1';
    process.env.FEATURE_COLLABORATION = '0';
    process.env.COLLAB_REQUIRE_AUTH = '0'; // 소켓 네임스페이스 인증 비활성화
    process.env.ENFORCE_AUTH_WRITES = 'false';

    vi.resetModules();
    ({ registerRoutes } = await import('../routes.js'));

    app = express();
    app.use(express.json());
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
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 15000);

  it('emits notification:new to user room when a notification is created', async () => {
    const nsUrl = `${baseUrl}/collab`;
    const client = Client(nsUrl, {
      transports: ['polling'],
      timeout: 4000,
      reconnection: false,
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
            if (payload?.recipientId === recipientId) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test', title: 't', content: 'c', recipientId }),
      });
      if (!res.ok) throw new Error(`create notif failed: ${res.status}`);

      await expect(received).resolves.toBeUndefined();
    } finally {
      client.close();
    }
  }, 15000);
});
