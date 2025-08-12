import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
    const actual = await importOriginal() as any;
    const memStorageInstance = new actual.MemStorage();

    // Replace all methods with vi.fn() to allow for mocking in tests
    for (const key of Object.getOwnPropertyNames(actual.MemStorage.prototype)) {
        if (key !== 'constructor' && typeof memStorageInstance[key] === 'function') {
            memStorageInstance[key] = vi.fn();
        }
    }

    return {
        ...actual,
        MemStorage: vi.fn(() => memStorageInstance),
        storage: memStorageInstance,
    };
});

import { storage } from '../storage';

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
    const mockNotification = {
        id: 1,
        type: 'mention',
        title: 'You were mentioned',
        content: 'You were mentioned in a comment on the "Project Goals" page.',
        recipientId: recipientId,
        isRead: false,
    };

    it('TC-NOTIF-001: should create a new notification successfully', async () => {
        const newNotificationData = { type: 'task_assigned', title: 'New Task', content: 'You have been assigned a new task.', recipientId };
        (storage.createNotification as vi.Mock).mockResolvedValue({ ...newNotificationData, id: 2, isRead: false });

        const response = await request(app)
            .post('/api/notifications')
            .send(newNotificationData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id', 2);
    });

    it('TC-NOTIF-002: should retrieve all notifications for a recipient', async () => {
        const notifications = [mockNotification, { ...mockNotification, id: 2, type: 'comment' }];
        (storage.getNotifications as vi.Mock).mockResolvedValue(notifications);

        const response = await request(app).get(`/api/notifications?recipientId=${recipientId}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(notifications);
    });

    it('TC-NOTIF-003: should get the count of unread notifications', async () => {
        (storage.getUnreadNotificationCount as vi.Mock).mockResolvedValue(5);

        const response = await request(app).get(`/api/notifications/unread-count?recipientId=${recipientId}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ count: 5 });
    });

    it('TC-NOTIF-004: should mark a single notification as read', async () => {
        const readNotification = { ...mockNotification, isRead: true };
        (storage.markNotificationAsRead as vi.Mock).mockResolvedValue(readNotification);

        const response = await request(app).patch(`/api/notifications/${mockNotification.id}/read`);

        expect(response.status).toBe(200);
        expect(response.body.isRead).toBe(true);
    });

    it('TC-NOTIF-005: should mark all notifications for a recipient as read', async () => {
        (storage.markAllNotificationsAsRead as vi.Mock).mockResolvedValue({ success: true });

        const response = await request(app)
            .patch('/api/notifications/read-all')
            .send({ recipientId });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('All notifications marked as read');
    });

    it('TC-NOTIF-006: should delete a notification', async () => {
        (storage.deleteNotification as vi.Mock).mockResolvedValue({ success: true });

        const response = await request(app).delete(`/api/notifications/${mockNotification.id}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Notification deleted successfully');
    });
});
