import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'notif-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'notif-test-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    enforceAuthForWrites: true,
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

vi.mock('../features', () => ({
  featureFlags: {
    PAPYR_MODE: 'team',
    FEATURE_TEAMS: true,
    FEATURE_NOTIFICATIONS: true,
  },
  isFeatureEnabled: (key: string) => true,
}));

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const dbStorageInstance = new actual.DBStorage();

  // Replace all methods with vi.fn() to allow for mocking in tests
  for (const key of Object.getOwnPropertyNames(actual.DBStorage.prototype)) {
    if (key !== 'constructor' && typeof dbStorageInstance[key] === 'function') {
      dbStorageInstance[key] = vi.fn();
    }
  }

  return {
    ...actual,
    DBStorage: vi.fn(() => dbStorageInstance),
    storage: dbStorageInstance,
  };
});

import { storage } from '../storage.js';

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll((done) => {
  server.close(done);
});

describe('Notification Management API', () => {
  const recipientId = 1;
  const token = jwt.sign({ id: recipientId, email: 'user@test.com', role: 'user' }, TEST_SECRET);
  const auth = { Authorization: `Bearer ${token}` };
  const mockNotification = {
    id: 1,
    type: 'mention',
    title: 'You were mentioned',
    content: 'You were mentioned in a comment on the "Project Goals" page.',
    recipientId: recipientId,
    isRead: false,
  };

  it('TC-NOTIF-001: should create a new notification successfully', async () => {
    const newNotificationData = {
      type: 'task_assigned',
      title: 'New Task',
      content: 'You have been assigned a new task.',
      recipientId,
    };
    (storage.createNotification as vi.Mock).mockResolvedValue({
      ...newNotificationData,
      id: 2,
      isRead: false,
    });

    const response = await request(app)
      .post('/api/notifications')
      .set(auth)
      .send(newNotificationData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id', 2);
  });

  it('TC-NOTIF-002: should retrieve all notifications for a recipient', async () => {
    const notifications = [mockNotification, { ...mockNotification, id: 2, type: 'comment' }];
    (storage.getNotifications as vi.Mock).mockResolvedValue(notifications);

    const response = await request(app).get('/api/notifications').set(auth);

    expect(response.status).toBe(200);
    expect(response.body.notifications).toEqual(notifications);
    expect(response.body.pagination).toBeDefined();
  });

  it('TC-NOTIF-003: should get the count of unread notifications', async () => {
    (storage.getUnreadNotificationCount as vi.Mock).mockResolvedValue(5);

    const response = await request(app).get('/api/notifications/unread-count').set(auth);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 5 });
  });

  it('TC-NOTIF-004: should mark a single notification as read', async () => {
    const readNotification = { ...mockNotification, isRead: true };
    (storage.getNotification as vi.Mock).mockResolvedValue(mockNotification);
    (storage.markNotificationAsRead as vi.Mock).mockResolvedValue(readNotification);

    const response = await request(app)
      .patch(`/api/notifications/${mockNotification.id}/read`)
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.body.isRead).toBe(true);
  });

  it('TC-NOTIF-005: should mark all notifications for a recipient as read', async () => {
    (storage.markAllNotificationsAsRead as vi.Mock).mockResolvedValue({ success: true });

    const response = await request(app).patch('/api/notifications/read-all').set(auth);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('All notifications marked as read');
  });

  it('TC-NOTIF-006: should delete a notification', async () => {
    (storage.getNotification as vi.Mock).mockResolvedValue(mockNotification);
    (storage.deleteNotification as vi.Mock).mockResolvedValue({ success: true });

    const response = await request(app)
      .delete(`/api/notifications/${mockNotification.id}`)
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Notification deleted successfully');
  });
});
