import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Use vi.doMock to ensure the mock is hoisted
vi.doMock('../storage', async (importOriginal) => {
    const actual = await importOriginal() as any;
    const dbMock = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
    };
    return {
        ...actual,
        MemStorage: vi.fn(),
        storage: { db: dbMock },
    };
});

// Mock external libraries
vi.mock('bcrypt');
vi.mock('jsonwebtoken');

// Dynamically import after mocks are set up
const { registerRoutes } = await import('../routes');
const { storage } = await import('../storage');

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const result = await registerRoutes(app, storage);
  server = result.httpServer;
});

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mocks for storage.db to their chained implementation for each test
  (storage.db.select as vi.Mock).mockReturnThis();
  (storage.db.from as vi.Mock).mockReturnThis();
  (storage.db.insert as vi.Mock).mockReturnThis();
  (storage.db.values as vi.Mock).mockReturnThis();
});

afterAll((done) => {
  server.close(done);
});

describe('Authentication API', () => {
  describe('POST /papyr-us/api/auth/register', () => {
    it('TC-AUTH-001: should register a new user successfully', async () => {
      // Setup mock for this specific test
      (storage.db.select as vi.Mock).mockReturnThis();
      (storage.db.from as vi.Mock).mockReturnThis();
      (storage.db.where as vi.Mock).mockResolvedValue([]);
      (storage.db.insert as vi.Mock).mockReturnThis();
      (storage.db.values as vi.Mock).mockReturnThis();
      (storage.db.returning as vi.Mock).mockResolvedValue([{ id: 1, name: 'Test User', email: 'new.user@test.com' }]);
      (bcrypt.hash as vi.Mock).mockResolvedValue('hashed_password');

      const response = await request(app)
        .post('/papyr-us/api/auth/register')
        .send({
          name: 'Test User',
          email: 'new.user@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.user.email).toBe('new.user@test.com');
    });

    it('TC-AUTH-002: should fail to register with an existing email', async () => {
      // Setup mock for this specific test
      (storage.db.select as vi.Mock).mockReturnThis();
      (storage.db.from as vi.Mock).mockReturnThis();
      (storage.db.where as vi.Mock).mockResolvedValue([{ id: 2, email: 'existing.user@test.com' }]);

      const response = await request(app)
        .post('/papyr-us/api/auth/register')
        .send({
          name: 'Existing User',
          email: 'existing.user@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('User with this email already exists');
    });

     it('TC-AUTH-003: should fail to register with missing fields', async () => {
      const response = await request(app)
        .post('/papyr-us/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@test.com',
          // password is intentionally omitted
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Name, email, and password are required');
    });
  });

  describe('POST /papyr-us/api/auth/login', () => {
    const mockUser = { id: 1, name: 'Test User', email: 'user@test.com', hashedPassword: 'hashed_password' };

    it('TC-AUTH-004: should log in a user successfully', async () => {
      (storage.db.select as vi.Mock).mockReturnThis();
      (storage.db.from as vi.Mock).mockReturnThis();
      (storage.db.where as vi.Mock).mockResolvedValue([mockUser]);
      (bcrypt.compare as vi.Mock).mockResolvedValue(true);
      (jwt.sign as vi.Mock).mockReturnValue('fake_jwt_token');

      const response = await request(app)
        .post('/papyr-us/api/auth/login')
        .send({ email: 'user@test.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token', 'fake_jwt_token');
      expect(response.body.user.email).toBe('user@test.com');
    });

    it('TC-AUTH-005: should fail to log in with incorrect password', async () => {
      (storage.db.select as vi.Mock).mockReturnThis();
      (storage.db.from as vi.Mock).mockReturnThis();
      (storage.db.where as vi.Mock).mockResolvedValue([mockUser]);
      (bcrypt.compare as vi.Mock).mockResolvedValue(false); // Incorrect password

      const response = await request(app)
        .post('/papyr-us/api/auth/login')
        .send({ email: 'user@test.com', password: 'wrong_password' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('TC-AUTH-006: should fail to log in with a non-existent email', async () => {
      (storage.db.select as vi.Mock).mockReturnThis();
      (storage.db.from as vi.Mock).mockReturnThis();
      (storage.db.where as vi.Mock).mockResolvedValue([]); // User not found

      const response = await request(app)
        .post('/papyr-us/api/auth/login')
        .send({ email: 'nouser@test.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });
  });

  describe('GET /papyr-us/api/auth/me', () => {
    const mockUser = { id: 1, name: 'Test User', email: 'user@test.com' };
    const token = 'fake_jwt_token';

    it("TC-AUTH-007: should get current user's info with a valid token", async () => {
      (jwt.verify as vi.Mock).mockReturnValue({ id: mockUser.id });
      (storage.db.select as vi.Mock).mockReturnThis();
      (storage.db.from as vi.Mock).mockReturnThis();
      (storage.db.where as vi.Mock).mockResolvedValue([mockUser]);

      const response = await request(app)
        .get('/papyr-us/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUser);
    });

    it("TC-AUTH-008: should fail to get user's info without a token", async () => {
      const response = await request(app).get('/papyr-us/api/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No token provided');
    });

    it("TC-AUTH-008: should fail to get user's info with an invalid token", async () => {
      (jwt.verify as vi.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .get('/papyr-us/api/auth/me')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid token');
    });
  });
});
