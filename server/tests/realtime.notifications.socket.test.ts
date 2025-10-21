import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client } from 'socket.io-client';
import { registerRoutes } from '../routes.js';

// UI 없이 소켓 알림이 정상 브로드캐스트 되는지 검증하는 통합 테스트
describe('Realtime notifications over Socket.IO', () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;

  // 테스트용 storage 더미 구현
  const recipientId = 4242;
  const fakeStorage: any = {
    createNotification: async (n: any) => ({ id: 1, isRead: false, ...n }),
    getUnreadNotificationCount: async (_rid: number) => 1,
  };

  beforeAll(async () => {
    process.env.COLLAB_REQUIRE_AUTH = '0'; // 소켓 네임스페이스 인증 비활성화
    app = express();
    app.use(express.json());
    const reg = await registerRoutes(app, fakeStorage);
    server = reg.httpServer;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('emits notification:new to user room when a notification is created', async () => {
    const nsUrl = `${baseUrl}/collab`;
    const client = Client(nsUrl, { transports: ['polling', 'websocket'] });

    const received = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for notification:new')), 8000);
      client.on('connect', async () => {
        // Join user room to receive notifications
        client.emit('join-member', { memberId: recipientId });
        // REST 호출을 통해 알림 생성 (registerRoutes 내부 io를 통해 브로드캐스트됨)
        try {
          const res = await fetch(`${baseUrl}/api/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'test', title: 't', content: 'c', recipientId }),
          });
          if (!res.ok) throw new Error(`create notif failed: ${res.status}`);
        } catch (e) {
          clearTimeout(t);
          reject(e);
        }
      });

      client.on('notification:new', (payload: any) => {
        try {
          if (payload?.recipientId === recipientId) {
            clearTimeout(t as unknown as NodeJS.Timeout);
            resolve();
          }
        } catch (e) {
          clearTimeout(t as unknown as NodeJS.Timeout);
          reject(e);
        } finally {
          client.close();
        }
      });

      client.on('connect_error', (err) => {
        clearTimeout(t as unknown as NodeJS.Timeout);
        reject(err);
      });
    });

    await expect(received).resolves.toBeUndefined();
  });
});
