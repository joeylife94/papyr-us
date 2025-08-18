import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';
import path from 'path';
import fs from 'fs';

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
    const actual = await importOriginal() as any;
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

// Mock the entire upload service module
vi.mock('../services/upload', async () => {
    const actual = await vi.importActual('../services/upload') as any;
    return {
        ...actual, // Use actual 'upload' middleware from multer
        processUploadedFile: vi.fn(),
        listUploadedFiles: vi.fn(),
        getFileInfo: vi.fn(),
        deleteUploadedFile: vi.fn(),
    };
});

import { processUploadedFile, listUploadedFiles, getFileInfo, deleteUploadedFile } from '../services/upload';

import { storage } from '../storage.js';

let app: Express;
let server: http.Server;
const testFilePath = path.join(__dirname, 'test-file.txt');

beforeAll(async () => {
    // Create a dummy file for testing uploads
    if (!fs.existsSync(path.dirname(testFilePath))) {
        fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
    }
    fs.writeFileSync(testFilePath, 'This is a test file.');

    app = express();
    app.use(express.json());
    ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
    vi.clearAllMocks();
});

afterAll(() => {
    // Clean up the dummy file
    fs.unlinkSync(testFilePath);
    server.close();
});

describe('File Upload API', () => {
    const mockFile = {
        id: 1,
        filename: 'test-file.txt',
        path: '/uploads/files/test-file.txt',
        mimetype: 'text/plain',
        size: 22,
        teamId: '1',
        createdAt: new Date().toISOString(),
    };

    it('TC-UPL-001: should upload a file successfully', async () => {
        (processUploadedFile as vi.Mock).mockResolvedValue(mockFile);

        const response = await request(app)
            .post('/api/upload')
            .field('teamId', '1')
            .attach('files', testFilePath);

        expect(response.status).toBe(201);
        expect(response.body.message).toContain('1 file(s) uploaded successfully');
        expect(response.body.files[0]).toEqual(mockFile);
    });

    it('TC-UPL-002: should list all uploaded files for a team', async () => {
        const fileList = { files: [mockFile] };
        (listUploadedFiles as vi.Mock).mockResolvedValue(fileList);

        const response = await request(app).get('/api/uploads?teamId=1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(fileList);
    });

    it('TC-UPL-005: should delete an uploaded file', async () => {
        (deleteUploadedFile as vi.Mock).mockResolvedValue(true);

        const response = await request(app).delete(`/api/uploads/files/${mockFile.filename}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('File deleted successfully');
    });

    // Note: Testing the actual file serving (TC-UPL-003, TC-UPL-004) is more of an e2e/integration test concern
    // as it involves the filesystem and response streaming. We'll trust Express's res.sendFile and our mock for getFileInfo.
    it('TC-UPL-004: should get file info for download', async () => {
        (getFileInfo as vi.Mock).mockResolvedValue({ ...mockFile, path: testFilePath });
        // We can't easily test the file download itself in a unit test,
        // but we can check if the route is hit and doesn't error out.
        const response = await request(app).get(`/api/uploads/files/${mockFile.filename}`);
        
        // If getFileInfo is called correctly and res.sendFile is triggered,
        // supertest will handle the stream. A 200 status is a good indicator of success.
        expect(response.status).toBe(200);
        expect(response.headers['content-disposition']).toContain(`attachment; filename="${mockFile.filename}"`);
    });
});
