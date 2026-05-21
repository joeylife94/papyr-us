import type { Express } from 'express';
import {
  requireAuthIfEnabled,
  requireTeamMembership,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { buildRateLimiter } from '../middleware.js';
import * as aiService from '../services/ai.js';
import {
  smartSearch,
  generateSearchSuggestions,
  inlineAIAction,
} from '../services/ai.js';
import { aiAssistant } from '../services/ai-assistant.js';
import { DBStorage } from '../storage.js';
import logger from '../services/logger.js';

const rlAI = buildRateLimiter({ windowMs: 60_000, max: 15 });

async function listUploadedFiles(teamId: string) {
  const { listUploadedFiles: _listFiles } = await import('../services/upload.js');
  return _listFiles(teamId);
}

export function registerAIRoutes(app: Express, storage: DBStorage): void {
  // AI Generate content
  app.post('/api/ai/generate', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { prompt, type } = req.body;
      const { generateContent } = await import('../services/ai.js');
      const content = await generateContent(prompt, type);
      res.json({ content });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Failed to generate content', error: (error as Error).message });
    }
  });

  app.post('/api/ai/improve', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { content, title } = req.body;
      const { generateContentSuggestions } = await import('../services/ai.js');
      const suggestions = await generateContentSuggestions(content, title);
      res.json({ suggestions });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Failed to generate suggestions', error: (error as Error).message });
    }
  });

  // AI Search
  app.post('/api/ai/search', rlAI, requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { query, teamId } = req.body;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({ message: 'Search query is required' });
      }

      const userTeamIds = req.user?.id ? await storage.getUserTeamIds(req.user.id) : [];

      if (teamId) {
        if (!userTeamIds.map(String).includes(String(teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      }

      const effectiveTeamIds: string[] = teamId ? [String(teamId)] : userTeamIds.map(String);

      if (effectiveTeamIds.length === 0) {
        return res.json({ results: [], query, totalResults: 0 });
      }

      const [pagesAgg, tasksAgg] = await Promise.all([
        Promise.all(
          effectiveTeamIds.map((tid) =>
            storage.searchWikiPages({ query: '', teamId: tid, limit: 100, offset: 0 })
          )
        ),
        Promise.all(effectiveTeamIds.map((tid) => storage.getTasks(tid))),
      ]);
      const allPages = pagesAgg.flatMap((r: any) => r.pages);
      const allTasks = tasksAgg.flat();
      const filesPerTeam = await Promise.all(effectiveTeamIds.map((tid) => listUploadedFiles(tid)));
      const allFiles = filesPerTeam.flatMap((r) => r.files);

      const documents = [
        ...allPages.map((page: any) => ({
          id: page.id,
          title: page.title,
          content: page.content,
          type: 'page' as const,
          url: `/page/${page.slug}`,
        })),
        ...allTasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          content: task.description || '',
          type: 'task' as const,
          url: `/tasks`,
        })),
        ...allFiles.map((file: any) => ({
          id: file.id || 0,
          title: file.filename,
          content: file.description || '',
          type: 'file' as const,
          url: `/files`,
        })),
      ];

      const results = await smartSearch(query, documents);

      res.json({
        results,
        query,
        totalResults: results.length,
      });
    } catch (error) {
      console.error('AI search error:', error);
      res
        .status(500)
        .json({ message: 'Failed to perform AI search', error: (error as Error).message });
    }
  });

  app.post('/api/ai/search-suggestions', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { query } = req.body;

      if (!query || query.trim().length === 0) {
        return res.json({ suggestions: [] });
      }

      const suggestions = await generateSearchSuggestions(query);
      res.json({ suggestions });
    } catch (error) {
      console.error('Search suggestions error:', error);
      res.status(500).json({
        message: 'Failed to generate search suggestions',
        error: (error as Error).message,
      });
    }
  });

  // AI Copilot Chat
  app.post('/api/ai/copilot/chat', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { messages, context } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const response = await aiService.chatWithCopilot(messages, context || {});
      res.json({ response });
    } catch (error) {
      console.error('Copilot chat error:', error);
      res.status(500).json({
        message: 'Failed to chat with copilot',
        error: (error as Error).message,
      });
    }
  });

  // Extract tasks from content
  app.post('/api/ai/extract-tasks', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const tasks = await aiService.extractTasks(content);
      res.json({ tasks });
    } catch (error) {
      console.error('Extract tasks error:', error);
      res.status(500).json({
        message: 'Failed to extract tasks',
        error: (error as Error).message,
      });
    }
  });

  // Find related pages
  app.post('/api/ai/related-pages', rlAI, requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { content, title, pageId } = req.body;

      if (!content || !title) {
        return res.status(400).json({ error: 'Content and title are required' });
      }

      const userTeamIdsForRelated = req.user?.id ? await storage.getUserTeamIds(req.user.id) : [];
      if (userTeamIdsForRelated.length === 0) {
        return res.json({ relatedPages: [] });
      }
      const relatedPageResults = await Promise.all(
        userTeamIdsForRelated.map((tid) =>
          storage.searchWikiPages({ query: '', teamId: String(tid), limit: 100, offset: 0 })
        )
      );
      const searchResults = { pages: relatedPageResults.flatMap((r: any) => r.pages) };
      const availablePages = searchResults.pages
        .filter((p: any) => p.id !== pageId)
        .map((p: any) => ({
          id: p.id,
          title: p.title,
          content: p.content,
          tags: p.tags || [],
        }));

      const relatedPages = await aiService.findRelatedPages(content, title, availablePages);
      res.json({ relatedPages });
    } catch (error) {
      console.error('Find related pages error:', error);
      res.status(500).json({
        message: 'Failed to find related pages',
        error: (error as Error).message,
      });
    }
  });

  // Knowledge Graph API
  app.get(
    '/api/knowledge-graph',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const teamId = req.query.teamId as string | undefined;
        const includeAILinks = req.query.includeAI === 'true';

        const userTeamIds: number[] = (req as any).userTeamIds ?? [];

        if (teamId && !userTeamIds.map(String).includes(teamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }

        const effectiveTeamIds: string[] = teamId ? [teamId] : userTeamIds.map(String);

        if (effectiveTeamIds.length === 0) {
          return res.json({ nodes: [], links: [] });
        }

        const pageResults = await Promise.all(
          effectiveTeamIds.map((tid) =>
            storage.searchWikiPages({ query: '', limit: 1000, offset: 0, teamId: tid })
          )
        );
        const pages = pageResults.flatMap((r: any) => r.pages);

        const nodes: any[] = [];
        const links: any[] = [];
        const tagMap = new Map<string, Set<number>>();

        pages.forEach((page: any) => {
          const connections = 0;
          const isOrphan = connections === 0;

          nodes.push({
            id: `page-${page.id}`,
            name: page.title,
            type: isOrphan ? 'orphan' : 'page',
            val: 10,
            color: isOrphan ? '#EF4444' : '#3B82F6',
            pageId: page.id,
            slug: page.slug,
            connections: 0,
            tags: page.tags,
            content: page.content,
          });

          page.tags?.forEach((tag: string) => {
            if (!tagMap.has(tag)) {
              tagMap.set(tag, new Set());
            }
            tagMap.get(tag)!.add(page.id);
          });

          const linkRegex = /\[\[([^\]]+)\]\]/g;
          const matches = page.content.matchAll(linkRegex);
          for (const match of matches) {
            const linkedTitle = match[1];
            const linkedPage = pages.find(
              (p: any) => p.title.toLowerCase() === linkedTitle.toLowerCase()
            );
            if (linkedPage && linkedPage.id !== page.id) {
              links.push({
                source: `page-${page.id}`,
                target: `page-${linkedPage.id}`,
                type: 'content',
                strength: 2,
              });
            }
          }
        });

        tagMap.forEach((pageIds, tag) => {
          if (pageIds.size > 1) {
            nodes.push({
              id: `tag-${tag}`,
              name: `#${tag}`,
              type: 'tag',
              val: pageIds.size * 5,
              color: '#F59E0B',
              connections: pageIds.size,
            });

            const pageIdArray = Array.from(pageIds);
            pageIdArray.forEach((pageId) => {
              links.push({
                source: `page-${pageId}`,
                target: `tag-${tag}`,
                type: 'tag',
                strength: 1,
              });
            });
          }
        });

        if (includeAILinks && pages.length > 0) {
          try {
            const aiModule = await import('../services/ai.js');

            const samplePages = pages
              .filter((p: any) => p.content && p.content.length > 100)
              .sort(() => Math.random() - 0.5)
              .slice(0, 20);

            for (const page of samplePages) {
              try {
                const relatedPages = await aiModule.findRelatedPages(
                  page.content,
                  page.title,
                  pages.filter((p: any) => p.id !== page.id)
                );

                if (relatedPages && relatedPages.length > 0) {
                  relatedPages.slice(0, 3).forEach((related: any) => {
                    const existingLink = links.find(
                      (l) =>
                        (l.source === `page-${page.id}` && l.target === `page-${related.pageId}`) ||
                        (l.target === `page-${page.id}` && l.source === `page-${related.pageId}`)
                    );

                    if (!existingLink && related.relevance > 0.5) {
                      links.push({
                        source: `page-${page.id}`,
                        target: `page-${related.pageId}`,
                        type: 'ai-recommended',
                        strength: 1,
                        relevance: related.relevance,
                        reason: related.reason,
                      });
                    }
                  });
                }
              } catch (aiError) {
                console.error(`AI link generation failed for page ${page.id}:`, aiError);
              }
            }
          } catch (aiError) {
            console.error('AI link generation failed:', aiError);
          }
        }

        nodes.forEach((node) => {
          const nodeLinks = links.filter(
            (link) => link.source === node.id || link.target === node.id
          );
          node.connections = nodeLinks.length;
          node.val = 10 + node.connections * 3;

          if (node.type === 'page' && node.connections === 0) {
            node.type = 'orphan';
            node.color = '#EF4444';
          } else if (node.type === 'orphan' && node.connections > 0) {
            node.type = 'page';
            node.color = '#3B82F6';
          }
        });

        nodes.forEach((node) => {
          delete node.content;
        });

        res.json({ nodes, links });
      } catch (error) {
        console.error('Knowledge graph error:', error);
        res.status(500).json({
          message: 'Failed to generate knowledge graph',
          error: (error as Error).message,
        });
      }
    }
  );

  // ==================== AI Assistant Routes ====================

  app.get('/api/ai/status', (req, res) => {
    res.json({
      available: aiAssistant.isAvailable(),
      message: aiAssistant.isAvailable()
        ? 'AI assistant is ready'
        : 'AI assistant requires OPENAI_API_KEY configuration',
    });
  });

  app.post('/api/ai/assist', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { command, text, language, targetCase } = req.body;

      if (!command || !text) {
        return res.status(400).json({ error: 'command and text are required' });
      }

      const result = await aiAssistant.assist({
        command,
        text,
        language,
        targetCase,
      });

      res.json(result);
    } catch (error) {
      logger.error('[Route] /api/ai/assist — upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  app.post('/api/ai/generate-block', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { prompt, blockType } = req.body;

      if (!prompt || !blockType) {
        return res.status(400).json({ error: 'prompt and blockType are required' });
      }

      if (!['table', 'list', 'code'].includes(blockType)) {
        return res.status(400).json({ error: 'Invalid blockType. Must be: table, list, or code' });
      }

      const result = await aiAssistant.generateBlock(prompt, blockType);
      res.json(result);
    } catch (error) {
      logger.error('[Route] /api/ai/generate-block — upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  app.post('/api/ai/suggestions', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { text, cursorPosition } = req.body;

      if (text === undefined || cursorPosition === undefined) {
        return res.status(400).json({ error: 'text and cursorPosition are required' });
      }

      const suggestions = await aiAssistant.getSuggestions(text, cursorPosition);
      res.json({ suggestions });
    } catch (error) {
      logger.error('[Route] /api/ai/suggestions — upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  app.post('/api/ai/auto-format', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'text is required' });
      }

      const result = await aiAssistant.autoFormat(text);
      res.json(result);
    } catch (error) {
      logger.error('[Route] /api/ai/auto-format — upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  app.post('/api/ai/inline', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { action, text } = req.body;

      if (!action || !text) {
        return res.status(400).json({ error: 'action and text are required' });
      }

      if (!['summarize', 'rewrite', 'taskify'].includes(action)) {
        return res
          .status(400)
          .json({ error: 'Invalid action. Must be: summarize, rewrite, or taskify' });
      }

      const result = await inlineAIAction(action, text);
      res.json(result);
    } catch (error) {
      logger.error('[Route] /api/ai/inline — upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });
}
