import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

// Mock the AI and dependent storage services
vi.mock('../services/ai', () => ({
    generateContent: vi.fn(),
    generateContentSuggestions: vi.fn(),
    smartSearch: vi.fn(),
    generateSearchSuggestions: vi.fn(),
}));

vi.mock('../storage', async () => {
    const actualStorage = await vi.importActual('../storage') as any;
    return {
        storage: {
            ...actualStorage.storage,
            searchWikiPages: vi.fn(),
            getTasks: vi.fn(),
        },
    };
});

vi.mock('../services/upload', async () => {
    const actual = await vi.importActual('../services/upload') as any;
    return {
        ...actual, // Use actual 'upload' middleware from multer
        listUploadedFiles: vi.fn(),
    };
});


import { generateContent, generateContentSuggestions, smartSearch, generateSearchSuggestions } from '../services/ai';
import { storage } from '../storage';
import { listUploadedFiles } from '../services/upload';


let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  server = await registerRoutes(app);
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});

describe('AI Services API', () => {

    it('TC-AI-001: should generate content with AI successfully', async () => {
        const prompt = 'Write a poem about coding.';
        const generated = { content: 'Roses are red, my screen is blue, I love to code, how about you?' };
        (generateContent as vi.Mock).mockResolvedValue(generated.content);

        const response = await request(app)
            .post('/papyr-us/api/ai/generate')
            .send({ prompt, type: 'poem' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(generated);
        expect(generateContent).toHaveBeenCalledWith(prompt, 'poem');
    });

    it('TC-AI-002: should get AI-powered suggestions to improve content', async () => {
        const content = { title: 'My Doc', content: 'This is my doc.' };
        const suggestions = { suggestions: ['Make it longer.', 'Add a joke.'] };
        (generateContentSuggestions as vi.Mock).mockResolvedValue(suggestions.suggestions);

        const response = await request(app)
            .post('/papyr-us/api/ai/improve')
            .send(content);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(suggestions);
    });

    it('TC-AI-003: should perform an AI-powered search across documents', async () => {
        const query = 'What is the project status?';
        const teamId = 'test-team';
        const searchResults = [{ id: 1, title: 'Project Status Page', content: 'Everything is on track.', type: 'page' }];
        
        // Mock dependent data sources
        (storage.searchWikiPages as vi.Mock).mockResolvedValue({ pages: [{ id: 1, title: 'Project Status Page', content: 'Everything is on track.', slug: 'status' }] });
        (storage.getTasks as vi.Mock).mockResolvedValue([]);
        (listUploadedFiles as vi.Mock).mockResolvedValue({ files: [] });
        
        (smartSearch as vi.Mock).mockResolvedValue(searchResults);

        const response = await request(app)
            .post('/papyr-us/api/ai/search')
            .send({ query, teamId });

        expect(response.status).toBe(200);
        expect(response.body.results).toEqual(searchResults);
        expect(smartSearch).toHaveBeenCalled();
    });

    it('TC-AI-004: should get search suggestions based on a query', async () => {
        const query = 'how to';
        const suggestions = { suggestions: ['how to setup the project', 'how to run tests'] };
        (generateSearchSuggestions as vi.Mock).mockResolvedValue(suggestions.suggestions);

        const response = await request(app)
            .post('/papyr-us/api/ai/search-suggestions')
            .send({ query });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(suggestions);
    });
});
