import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

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

describe('Calendar Event Management API', () => {
  const teamId = 'test-team';
  const mockEvent = {
    id: 1,
    title: 'Team Meeting',
    description: 'Weekly sync meeting.',
    startDate: new Date('2024-08-06T10:00:00.000Z'),
    endDate: new Date('2024-08-06T11:00:00.000Z'),
    teamId: teamId,
  };

  it('TC-CAL-001: should create a new calendar event successfully', async () => {
    const newEventData = {
      title: 'Project Kickoff',
      startDate: '2024-09-01T14:00:00.000Z',
      teamId: teamId,
    };
    (storage.createCalendarEvent as vi.Mock).mockResolvedValue({ ...newEventData, id: 2 });

    const response = await request(app).post('/api/calendar').send(newEventData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id', 2);
  });

  it('TC-CAL-002: should retrieve all calendar events for a team', async () => {
    const events = [mockEvent, { ...mockEvent, id: 2, title: 'Design Review' }];
    (storage.getCalendarEvents as vi.Mock).mockResolvedValue(events);

    const response = await request(app).get(`/api/calendar/${teamId}`);

    expect(response.status).toBe(200);
    // The route handler adds default values, so we need to check for a match
    expect(response.body[0].title).toBe(events[0].title);
    expect(response.body.length).toBe(2);
  });

  it('TC-CAL-003: should retrieve a single event by ID', async () => {
    (storage.getCalendarEvent as vi.Mock).mockResolvedValue(mockEvent);

    const response = await request(app).get(`/api/calendar/event/${mockEvent.id}`);

    expect(response.status).toBe(200);
    expect(response.body.title).toBe(mockEvent.title);
  });

  it('TC-CAL-004: should update an existing calendar event', async () => {
    const updateData = { title: 'Team Meeting [Rescheduled]' };
    const updatedEvent = { ...mockEvent, ...updateData };
    (storage.updateCalendarEvent as vi.Mock).mockResolvedValue(updatedEvent);

    const response = await request(app)
      .patch(`/api/calendar/event/${mockEvent.id}`)
      .send(updateData);

    expect(response.status).toBe(200);
    expect(response.body.title).toBe(updatedEvent.title);
  });

  it('TC-CAL-005: should delete a calendar event', async () => {
    (storage.deleteCalendarEvent as vi.Mock).mockResolvedValue({ success: true });

    const response = await request(app).delete(`/api/calendar/event/${mockEvent.id}`);

    expect(response.status).toBe(204);
  });
});
