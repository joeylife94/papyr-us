import type { Express } from 'express';
import { requireAuthIfEnabled, type AuthRequest } from '../middleware.js';
import { DBStorage } from '../storage.js';

export function registerDatabaseRoutes(app: Express, storage: DBStorage): void {
  // ==================== Database Schema Routes ====================

  app.post('/api/database/schemas', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { pageId, name, fields, primaryDisplay: _primaryDisplay } = req.body;

      if (!pageId || !name || !fields) {
        return res.status(400).json({ error: 'pageId, name, and fields are required' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const schema = await storage.createDatabaseSchema(pageId, userId, {
        name,
        fields,
      });

      res.status(201).json(schema);
    } catch (error) {
      console.error('Error creating database schema:', error);
      res.status(500).json({ error: 'Failed to create database schema' });
    }
  });

  app.get('/api/database/schemas/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid schema ID' });
      }

      const schema = await storage.getDatabaseSchema(id);
      if (!schema) {
        return res.status(404).json({ error: 'Schema not found' });
      }

      res.json(schema);
    } catch (error) {
      console.error('Error fetching database schema:', error);
      res.status(500).json({ error: 'Failed to fetch database schema' });
    }
  });

  app.patch('/api/database/schemas/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid schema ID' });
      }

      const { name, fields, primaryDisplay: _primaryDisplay } = req.body;
      const schema = await storage.updateDatabaseSchema(id, {
        name,
        fields,
      });

      res.json(schema);
    } catch (error) {
      console.error('Error updating database schema:', error);
      res.status(500).json({ error: 'Failed to update database schema' });
    }
  });

  app.delete('/api/database/schemas/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid schema ID' });
      }

      await storage.deleteDatabaseSchema(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting database schema:', error);
      res.status(500).json({ error: 'Failed to delete database schema' });
    }
  });

  // ==================== Database Row Routes ====================

  app.post('/api/database/rows', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { schemaId, data } = req.body;

      if (!schemaId || !data) {
        return res.status(400).json({ error: 'schemaId and data are required' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const row = await storage.createDatabaseRow(schemaId, userId, data);
      res.status(201).json(row);
    } catch (error) {
      console.error('Error creating database row:', error);
      res.status(500).json({ error: 'Failed to create database row' });
    }
  });

  app.get('/api/database/rows/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      const row = await storage.getDatabaseRow(id);
      if (!row) {
        return res.status(404).json({ error: 'Row not found' });
      }

      res.json(row);
    } catch (error) {
      console.error('Error fetching database row:', error);
      res.status(500).json({ error: 'Failed to fetch database row' });
    }
  });

  app.get('/api/database/schemas/:schemaId/rows', requireAuthIfEnabled, async (req, res) => {
    try {
      const schemaId = parseInt(req.params.schemaId);
      if (isNaN(schemaId)) {
        return res.status(400).json({ error: 'Invalid schema ID' });
      }

      const rows = await storage.getDatabaseRows(schemaId);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching database rows:', error);
      res.status(500).json({ error: 'Failed to fetch database rows' });
    }
  });

  app.patch('/api/database/rows/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      const { data } = req.body;
      if (!data) {
        return res.status(400).json({ error: 'data is required' });
      }

      const row = await storage.updateDatabaseRow(id, data);
      res.json(row);
    } catch (error) {
      console.error('Error updating database row:', error);
      res.status(500).json({ error: 'Failed to update database row' });
    }
  });

  app.delete('/api/database/rows/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      await storage.deleteDatabaseRow(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting database row:', error);
      res.status(500).json({ error: 'Failed to delete database row' });
    }
  });

  // ==================== Database Relations Routes ====================

  app.post('/api/database/relations', requireAuthIfEnabled, async (req, res) => {
    try {
      const { fromSchemaId, fromRowId, propertyName, toSchemaId, toRowId } = req.body;

      if (!fromSchemaId || !fromRowId || !propertyName || !toSchemaId || !toRowId) {
        return res.status(400).json({
          error: 'fromSchemaId, fromRowId, propertyName, toSchemaId, and toRowId are required',
        });
      }

      const relation = await storage.addRelation(
        fromSchemaId,
        fromRowId,
        propertyName,
        toSchemaId,
        toRowId
      );

      res.status(201).json(relation);
    } catch (error) {
      console.error('Error adding relation:', error);
      res.status(500).json({ error: 'Failed to add relation' });
    }
  });

  app.get('/api/database/rows/:rowId/relations', requireAuthIfEnabled, async (req, res) => {
    try {
      const rowId = parseInt(req.params.rowId);
      if (isNaN(rowId)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      const propertyName = req.query.propertyName as string | undefined;
      const relations = await storage.getRelations(rowId, propertyName);

      res.json(relations);
    } catch (error) {
      console.error('Error fetching relations:', error);
      res.status(500).json({ error: 'Failed to fetch relations' });
    }
  });

  app.delete('/api/database/relations/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid relation ID' });
      }

      await storage.deleteRelation(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting relation:', error);
      res.status(500).json({ error: 'Failed to delete relation' });
    }
  });

  app.post('/api/database/rows/:rowId/rollup', requireAuthIfEnabled, async (req, res) => {
    try {
      const rowId = parseInt(req.params.rowId);
      if (isNaN(rowId)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      const { fieldName, relationField, targetField, aggregation } = req.body;

      if (!fieldName || !relationField || !targetField || !aggregation) {
        return res.status(400).json({
          error: 'fieldName, relationField, targetField, and aggregation are required',
        });
      }

      const value = await storage.calculateRollup(rowId, fieldName, {
        relationField,
        targetField,
        aggregation,
      });

      res.json({ value });
    } catch (error) {
      console.error('Error calculating rollup:', error);
      res.status(500).json({ error: 'Failed to calculate rollup' });
    }
  });

  // ==================== Synced Block Routes ====================

  app.post('/api/synced-blocks', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { originalBlockId, content, pageId } = req.body;

      if (!originalBlockId || !content || !pageId) {
        return res.status(400).json({ error: 'originalBlockId, content, and pageId are required' });
      }

      if (!req.user?.id) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const syncedBlock = await storage.createSyncedBlock(originalBlockId, pageId, content);
      res.status(201).json(syncedBlock);
    } catch (error) {
      console.error('Error creating synced block:', error);
      res.status(500).json({ error: 'Failed to create synced block' });
    }
  });

  app.get('/api/synced-blocks/:originalBlockId', requireAuthIfEnabled, async (req, res) => {
    try {
      const { originalBlockId } = req.params;

      const syncedBlock = await storage.getSyncedBlock(originalBlockId);
      if (!syncedBlock) {
        return res.status(404).json({ error: 'Synced block not found' });
      }

      res.json(syncedBlock);
    } catch (error) {
      console.error('Error fetching synced block:', error);
      res.status(500).json({ error: 'Failed to fetch synced block' });
    }
  });

  app.get('/api/synced-blocks', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.json([]);
      }
      const blocks = await storage.getUserSyncedBlocks(userId);
      res.json(blocks);
    } catch (error) {
      console.error('Error listing synced blocks:', error);
      res.json([]);
    }
  });

  app.patch('/api/synced-blocks/:originalBlockId', requireAuthIfEnabled, async (req, res) => {
    try {
      const { originalBlockId } = req.params;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'content is required' });
      }

      const syncedBlock = await storage.updateSyncedBlockContent(originalBlockId, content);
      res.json(syncedBlock);
    } catch (error) {
      console.error('Error updating synced block:', error);
      res.status(500).json({ error: 'Failed to update synced block' });
    }
  });

  app.delete('/api/synced-blocks/:originalBlockId', requireAuthIfEnabled, async (req, res) => {
    try {
      const { originalBlockId } = req.params;

      await storage.deleteSyncedBlock(originalBlockId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting synced block:', error);
      res.status(500).json({ error: 'Failed to delete synced block' });
    }
  });
}
