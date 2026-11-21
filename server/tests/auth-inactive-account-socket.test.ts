/**
 * Realtime connections need a session of an active account, read when the connection is made.
 *
 * Rules under test, over real Socket.IO connections to the real routes, with ENFORCE_AUTH_WRITES
 * on and off (the realtime rule does not depend on it):
 * - /collab refuses the connection of a still-valid access token whose account is deactivated or
 *   no longer exists, and one whose account cannot be read; an active account connects;
 * - /yjs gives such a token no identity: the connection is answered with AUTH_REQUIRED and closed;
 *   an active account stays connected;
 * - the account is read at each connection: the same token connects while the account is active
 *   and is refused once it is not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { vi } from 'vitest';

const SECRET = 'socket-inactive-account-secret';
const ACCOUNT = 4301;
const token = jwt.sign({ id: ACCOUNT, email: 'socket@example.com', role: 'user' }, SECRET, {
  expiresIn: '1h',
});

type Account = { id: number; email: string; isActive: boolean } | undefined | 'error';
let account: Account = { id: ACCOUNT, email: 'socket@example.com', isActive: true };

const fakeStorage: any = {
  getUserAccount: async (_id: number) => {
    if (account === 'error') throw new Error('database unavailable');
    return account;
  },
  getUserOrganizationId: async () => 1,
  getNotificationRecipientOrganizationId: async () => 1,
  getUnreadNotificationCount: async () => 0,
  checkPagePermission: async () => false,
  getUserPagePermission: async () => null,
};

describe.each(['true', 'false'])('realtime sessions with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.PAPYR_MODE = 'team';
    process.env.FEATURE_NOTIFICATIONS = '1';
    process.env.FEATURE_COLLABORATION = '1';
    process.env.COLLAB_REQUIRE_AUTH = '1';
    process.env.ENFORCE_AUTH_WRITES = enforce;
    process.env.JWT_SECRET = SECRET;

    vi.resetModules();
    const { registerRoutes } = await import('../routes.js');
    const app: Express = express();
    app.use(express.json());
    app.use(cookieParser());
    const reg = await registerRoutes(app, fakeStorage);
    server = reg.httpServer;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 30000);

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 15000);

  const open = (namespace: string): ClientSocket =>
    Client(`${baseUrl}${namespace}`, {
      transports: ['polling'],
      timeout: 4000,
      reconnection: false,
      extraHeaders: { Cookie: `accessToken=${token}` },
    });

  /** 'connected' or 'refused' for /collab. */
  const collabOutcome = async (): Promise<string> => {
    const client = open('/collab');
    try {
      return await new Promise<string>((resolve) => {
        const t = setTimeout(() => resolve('timeout'), 6000);
        client.on('connect', () => {
          clearTimeout(t);
          resolve('connected');
        });
        client.on('connect_error', () => {
          clearTimeout(t);
          resolve('refused');
        });
      });
    } finally {
      client.close();
    }
  };

  /** 'authenticated' when /yjs keeps the connection, the error code when it closes it. */
  const yjsOutcome = async (): Promise<string> => {
    const client = open('/yjs');
    try {
      return await new Promise<string>((resolve) => {
        const t = setTimeout(() => resolve('authenticated'), 1500);
        client.on('yjs:error', (e: { code: string }) => {
          clearTimeout(t);
          resolve(e.code);
        });
        client.on('connect_error', () => {
          clearTimeout(t);
          resolve('refused');
        });
      });
    } finally {
      client.close();
    }
  };

  const states: Array<[string, Account]> = [
    ['deactivated', { id: ACCOUNT, email: 'socket@example.com', isActive: false }],
    ['no longer existing', undefined],
    ['unreadable', 'error'],
  ];

  it.each(states)('/collab refuses an account that is %s', async (_label, state) => {
    account = state;
    expect(await collabOutcome()).toBe('refused');
  });

  it.each(states)('/yjs closes the connection of an account that is %s', async (_label, state) => {
    account = state;
    expect(await yjsOutcome()).toBe('AUTH_REQUIRED');
  });

  it('an active account connects to /collab and stays connected to /yjs', async () => {
    account = { id: ACCOUNT, email: 'socket@example.com', isActive: true };
    expect(await collabOutcome()).toBe('connected');
    expect(await yjsOutcome()).toBe('authenticated');
  });

  it('reads the account at each connection', async () => {
    account = { id: ACCOUNT, email: 'socket@example.com', isActive: true };
    expect(await collabOutcome()).toBe('connected');
    account = { id: ACCOUNT, email: 'socket@example.com', isActive: false };
    expect(await collabOutcome()).toBe('refused');
    expect(await yjsOutcome()).toBe('AUTH_REQUIRED');
    account = { id: ACCOUNT, email: 'socket@example.com', isActive: true };
    expect(await collabOutcome()).toBe('connected');
  });
});
