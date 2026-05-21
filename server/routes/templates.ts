import type { Express } from 'express';
import { requireAuthIfEnabled } from '../middleware.js';
import {
  insertTemplateCategorySchema,
  updateTemplateCategorySchema,
  insertTemplateSchema,
  updateTemplateSchema,
} from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import { featureFlags } from '../features.js';

export function registerTemplatesRoutes(app: Express, storage: DBStorage): void {
  if (featureFlags.FEATURE_TEMPLATES) {
    // Template Categories API
    app.get('/api/template-categories', async (req, res) => {
      try {
        const categories = await storage.getTemplateCategories();
        res.json(categories);
      } catch (error) {
        console.error('Error fetching template categories:', error);
        res.status(500).json({ error: 'Failed to fetch template categories' });
      }
    });

    app.get('/api/template-categories/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid category ID' });
        }

        const category = await storage.getTemplateCategory(id);
        if (!category) {
          return res.status(404).json({ error: 'Template category not found' });
        }

        res.json(category);
      } catch (error) {
        console.error('Error fetching template category:', error);
        res.status(500).json({ error: 'Failed to fetch template category' });
      }
    });

    app.post('/api/template-categories', requireAuthIfEnabled, async (req, res) => {
      try {
        const validatedData = insertTemplateCategorySchema.parse(req.body);
        const category = await storage.createTemplateCategory(validatedData);
        res.status(201).json(category);
      } catch (error) {
        console.error('Error creating template category:', error);
        res.status(400).json({ error: 'Failed to create template category' });
      }
    });

    app.put('/api/template-categories/:id', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid category ID' });
        }

        const validatedData = updateTemplateCategorySchema.parse(req.body);
        const category = await storage.updateTemplateCategory(id, validatedData);
        if (!category) {
          return res.status(404).json({ error: 'Template category not found' });
        }

        res.json(category);
      } catch (error) {
        console.error('Error updating template category:', error);
        res.status(400).json({ error: 'Failed to update template category' });
      }
    });

    app.delete('/api/template-categories/:id', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid category ID' });
        }

        const success = await storage.deleteTemplateCategory(id);
        if (!success) {
          return res.status(404).json({ error: 'Template category not found' });
        }

        res.status(204).send();
      } catch (error) {
        console.error('Error deleting template category:', error);
        res.status(500).json({ error: 'Failed to delete template category' });
      }
    });

    // Templates API
    app.get('/api/templates', async (req, res) => {
      try {
        const categoryId = req.query.categoryId
          ? parseInt(req.query.categoryId as string)
          : undefined;
        if (req.query.categoryId && isNaN(categoryId!)) {
          return res.status(400).json({ error: 'Invalid category ID' });
        }

        const templates = await storage.getTemplates(categoryId);
        res.json(templates);
      } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
      }
    });

    app.get('/api/templates/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        const template = await storage.getTemplate(id);
        if (!template) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json(template);
      } catch (error) {
        console.error('Error fetching template:', error);
        res.status(500).json({ error: 'Failed to fetch template' });
      }
    });

    app.post('/api/templates', requireAuthIfEnabled, async (req, res) => {
      try {
        const validatedData = insertTemplateSchema.parse(req.body);
        const template = await storage.createTemplate(validatedData);
        res.status(201).json(template);
      } catch (error) {
        console.error('Error creating template:', error);
        res.status(400).json({ error: 'Failed to create template' });
      }
    });

    app.put('/api/templates/:id', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        const validatedData = updateTemplateSchema.parse(req.body);
        const template = await storage.updateTemplate(id, validatedData);
        if (!template) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json(template);
      } catch (error) {
        console.error('Error updating template:', error);
        res.status(400).json({ error: 'Failed to update template' });
      }
    });

    app.delete('/api/templates/:id', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        const success = await storage.deleteTemplate(id);
        if (!success) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.status(204).send();
      } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
      }
    });

    app.post('/api/templates/:id/use', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        const success = await storage.incrementTemplateUsage(id);
        if (!success) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ success: true });
      } catch (error) {
        console.error('Error incrementing template usage:', error);
        res.status(500).json({ error: 'Failed to increment template usage' });
      }
    });
  }
}
