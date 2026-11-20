/**
 * The `:filename` of the upload routes names one uploaded file and nothing else.
 *
 * A route parameter arrives decoded, so it can hold path separators. The upload service joined
 * that value onto the uploads folder as it came. Rules under test, against the real service and
 * the real file system (storage mocked, write enforcement off so no session is involved):
 * - a name is accepted only when it is one plain path segment that an upload could have: no
 *   separator, no leading dot, not a sidecar (`_meta_…`) name;
 * - `deleteUploadedFile`, `getFileInfo` and `getFileTeamId` never touch a path outside the
 *   folder they serve, whatever name they are given;
 * - the three routes answer 400 `Invalid filename` before any lookup or file-system call;
 * - a real upload is still served, described and deleted by its stored name.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { registerRoutes } from '../routes';
import {
  deleteUploadedFile,
  getFileInfo,
  getFileTeamId,
  isSafeUploadFilename,
} from '../services/upload';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'upload-filename-secret',
    adminEmails: [],
    enforceAuthForWrites: false,
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

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage';

const FILES_DIR = path.join(process.cwd(), 'server', 'uploads', 'files');
const IMAGES_DIR = path.join(process.cwd(), 'server', 'uploads', 'images');
const tag = crypto.randomBytes(6).toString('hex');

// A file outside the uploads folder that must survive every request below, and the same file
// named the way a path-walking client would name it from each folder.
const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-filename-'));
const outsideFile = path.join(outsideDir, `keep-${tag}.txt`);
const walkFrom = (dir: string) => path.relative(dir, outsideFile);

// A stored upload with its sidecar, as processUploadedFile leaves them.
const storedName = `1700000000000-${tag}-report.txt`;
const storedPath = path.join(FILES_DIR, storedName);
const sidecarName = `_meta_${storedName}.json`;
const sidecarPath = path.join(FILES_DIR, sidecarName);

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage as any));
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(outsideFile, 'must survive');
  fs.writeFileSync(storedPath, 'stored upload');
  fs.writeFileSync(sidecarPath, JSON.stringify({ originalName: 'report.txt' }));
});

afterAll(async () => {
  for (const file of [storedPath, sidecarPath, outsideFile]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.rmSync(outsideDir, { recursive: true, force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const unsafeNames = [
  '',
  '.',
  '..',
  '.gitkeep',
  '../secret.txt',
  '../../package.json',
  'nested/file.txt',
  '..\\..\\package.json',
  'nested\\file.txt',
  '/etc/hostname',
  'report.txt\0.png',
  sidecarName,
  '_meta_anything.json',
  'a'.repeat(256),
];

describe('isSafeUploadFilename', () => {
  it.each(unsafeNames)('refuses %j', (name) => {
    expect(isSafeUploadFilename(name)).toBe(false);
  });

  it.each([undefined, null, 7, ['a.txt'], { name: 'a.txt' }])('refuses the non-string %j', (v) => {
    expect(isSafeUploadFilename(v)).toBe(false);
  });

  it.each([storedName, '1700000000000-0123456789abcdef-.png', 'photo_2-final.JPG', 'a'])(
    'accepts %j',
    (name) => {
      expect(isSafeUploadFilename(name)).toBe(true);
    }
  );
});

describe('the upload service stays inside its folder', () => {
  it('deletes nothing outside the folder', async () => {
    expect(await deleteUploadedFile(walkFrom(FILES_DIR), false)).toBe(false);
    expect(await deleteUploadedFile(walkFrom(IMAGES_DIR), true)).toBe(false);
    expect(await deleteUploadedFile(outsideFile, false)).toBe(false);
    expect(fs.existsSync(outsideFile)).toBe(true);
  });

  it('describes and reads metadata of nothing outside the folder', async () => {
    expect(await getFileInfo(walkFrom(FILES_DIR), false)).toBeNull();
    expect(await getFileInfo(walkFrom(IMAGES_DIR), true)).toBeNull();
    expect(await getFileTeamId(walkFrom(FILES_DIR), false)).toBeUndefined();
  });

  it('does not delete or describe a sidecar by its own name', async () => {
    expect(await deleteUploadedFile(sidecarName, false)).toBe(false);
    expect(await getFileInfo(sidecarName, false)).toBeNull();
    expect(fs.existsSync(sidecarPath)).toBe(true);
  });

  it('still describes a stored upload', async () => {
    const info = await getFileInfo(storedName, false);
    expect(info).toMatchObject({ filename: storedName, path: storedPath });
    expect(await getFileTeamId(storedName, false)).toBeNull();
  });
});

describe('the upload routes refuse a filename that is not one', () => {
  const encoded = (name: string) => encodeURIComponent(name);

  it('DELETE answers 400 and leaves the outside file alone', async () => {
    for (const type of ['files', 'images']) {
      const dir = type === 'files' ? FILES_DIR : IMAGES_DIR;
      const response = await request(app).delete(`/api/uploads/${type}/${encoded(walkFrom(dir))}`);
      expect(response.status, type).toBe(400);
      expect(response.body).toEqual({ message: 'Invalid filename' });
    }
    expect(fs.existsSync(outsideFile)).toBe(true);
  });

  it('DELETE refuses a sidecar name and keeps the sidecar', async () => {
    const response = await request(app).delete(`/api/uploads/files/${encoded(sidecarName)}`);
    expect(response.status).toBe(400);
    expect(fs.existsSync(sidecarPath)).toBe(true);
  });

  it('DELETE refuses separators in either style, and dot names', async () => {
    for (const name of ['..\\..\\package.json', 'nested/file.txt', '.gitkeep']) {
      const response = await request(app).delete(`/api/uploads/files/${encoded(name)}`);
      expect(response.status, name).toBe(400);
    }
  });

  it('a stored upload is still deleted by its name, with its sidecar', async () => {
    const response = await request(app).delete(`/api/uploads/files/${encoded(storedName)}`);
    expect(response.status).toBe(200);
    expect(fs.existsSync(storedPath)).toBe(false);
    expect(fs.existsSync(sidecarPath)).toBe(false);
    expect(fs.existsSync(outsideFile)).toBe(true);
  });
});
