/**
 * Full-Text Search (FTS) Integration Test
 *
 * Tests the Postgres FTS functionality for wiki pages search.
 * This test is intentionally classified as an INTEGRATION test:
 *   - It requires a running PostgreSQL database.
 *   - It is excluded from the default vitest run (vitest.config.ts).
 *   - Run it via: DATABASE_URL=<real-db> npm run test:integration
 *
 * It does NOT use server/tests/setup.ts — the integration config
 * (vitest.integration.config.ts) omits that setupFile intentionally.
 *
 * DATABASE_URL REQUIRED: If this file is reached without DATABASE_URL set,
 * a sentinel test FAILS immediately so the absence is visible (not silently skipped).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Requires a real, reachable PostgreSQL database.
// When DATABASE_URL is absent we fail a sentinel test rather than silently skipping
// so that `npm run test:integration` run without a database produces a visible error,
// not a misleadingly clean "all skipped" result.
if (!process.env.DATABASE_URL) {
  describe('Full-Text Search (FTS) — integration setup required', () => {
    it('DATABASE_URL must be set to run FTS integration tests', () => {
      throw new Error(
        '[Integration] DATABASE_URL is not set. FTS integration tests require a live PostgreSQL database.\n' +
          'Run: DATABASE_URL=postgresql://user:pass@host/db npm run test:integration'
      );
    });
  });
}

// Only define the real suite when DATABASE_URL is present.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (process.env.DATABASE_URL) {
  describe('Full-Text Search (FTS)', () => {
    let storage: any;
    let testPageIds: number[] = [];

    beforeAll(async () => {
      const { DBStorage } = await import('../../storage.js');
      storage = new DBStorage();

      // Create test pages for search
      const testPages = [
        {
          title: 'React TypeScript Tutorial',
          slug: 'react-typescript-tutorial-fts-test',
          content: 'Learn how to build modern web applications with React and TypeScript',
          folder: 'test',
          tags: ['react', 'typescript', 'tutorial'],
          author: 'test-user',
          teamId: null,
        },
        {
          title: 'Node.js Backend Development',
          slug: 'nodejs-backend-dev-fts-test',
          content: 'Building scalable backend services with Node.js and Express',
          folder: 'test',
          tags: ['nodejs', 'backend', 'express'],
          author: 'test-user',
          teamId: null,
        },
        {
          title: 'Database Design Patterns',
          slug: 'database-design-patterns-fts-test',
          content: 'PostgreSQL FTS and advanced query optimization techniques',
          folder: 'test',
          tags: ['database', 'postgresql', 'fts'],
          author: 'test-user',
          teamId: null,
        },
      ];

      for (const page of testPages) {
        const created = await storage.createWikiPage(page);
        testPageIds.push(created.id);
      }
    });

    afterAll(async () => {
      // Clean up test pages
      for (const id of testPageIds) {
        await storage.deleteWikiPage(id);
      }
      await storage.pool.end();
    });

    it('should find pages by title keyword', async () => {
      const result = await storage.searchWikiPages({
        query: 'React',
        limit: 10,
        offset: 0,
      });

      expect(result.pages.length).toBeGreaterThan(0);
      const reactPage = result.pages.find(
        (p: any) => p.slug === 'react-typescript-tutorial-fts-test'
      );
      expect(reactPage).toBeDefined();
      expect(reactPage?.title).toContain('React');
    });

    it('should find pages by content keyword', async () => {
      const result = await storage.searchWikiPages({
        query: 'scalable',
        limit: 10,
        offset: 0,
      });

      expect(result.pages.length).toBeGreaterThan(0);
      const nodePage = result.pages.find((p: any) => p.slug === 'nodejs-backend-dev-fts-test');
      expect(nodePage).toBeDefined();
      expect(nodePage?.content).toContain('scalable');
    });

    it('should find pages by tag', async () => {
      const result = await storage.searchWikiPages({
        query: 'postgresql',
        limit: 10,
        offset: 0,
      });

      const dbPage = result.pages.find((p: any) => p.slug === 'database-design-patterns-fts-test');
      expect(dbPage).toBeDefined();
      expect(dbPage?.tags).toContain('postgresql');
    });

    it('should filter by tags array', async () => {
      const result = await storage.searchWikiPages({
        tags: ['react', 'typescript'],
        limit: 10,
        offset: 0,
      });

      expect(result.pages.length).toBeGreaterThan(0);
      const reactPage = result.pages.find(
        (p: any) => p.slug === 'react-typescript-tutorial-fts-test'
      );
      expect(reactPage).toBeDefined();
    });

    it('should filter by folder', async () => {
      const result = await storage.searchWikiPages({
        folder: 'test',
        limit: 10,
        offset: 0,
      });

      expect(result.pages.length).toBeGreaterThanOrEqual(3);
      const testPages = result.pages.filter((p: any) => testPageIds.includes(p.id));
      expect(testPages.length).toBe(3);
    });

    it('should support pagination', async () => {
      const firstPage = await storage.searchWikiPages({
        folder: 'test',
        limit: 2,
        offset: 0,
      });

      const secondPage = await storage.searchWikiPages({
        folder: 'test',
        limit: 2,
        offset: 2,
      });

      expect(firstPage.pages.length).toBeLessThanOrEqual(2);
      expect(secondPage.pages.length).toBeGreaterThan(0);
      expect(firstPage.total).toBeGreaterThanOrEqual(3);
    });

    it('should rank results by relevance when sort=rank', async () => {
      const result = await storage.searchWikiPages({
        query: 'FTS',
        sort: 'rank',
        limit: 10,
        offset: 0,
      });

      if (result.pages.length > 0) {
        // The page with "FTS" in content should be in results
        const ftsPage = result.pages.find(
          (p: any) => p.slug === 'database-design-patterns-fts-test'
        );
        expect(ftsPage).toBeDefined();
      }
    });

    it('should handle multi-word queries', async () => {
      const result = await storage.searchWikiPages({
        query: 'React TypeScript',
        limit: 10,
        offset: 0,
      });

      expect(result.pages.length).toBeGreaterThan(0);
      const reactPage = result.pages.find(
        (p: any) => p.slug === 'react-typescript-tutorial-fts-test'
      );
      expect(reactPage).toBeDefined();
    });

    it('should return total count', async () => {
      const result = await storage.searchWikiPages({
        folder: 'test',
        limit: 1,
        offset: 0,
      });

      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(typeof result.total).toBe('number');
    });

    it('should handle empty query gracefully', async () => {
      const result = await storage.searchWikiPages({
        query: '',
        limit: 10,
        offset: 0,
      });

      expect(result.pages).toBeDefined();
      expect(Array.isArray(result.pages)).toBe(true);
    });
  });
} // end: if (process.env.DATABASE_URL)
