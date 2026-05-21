import type { Express } from 'express';
import { requireAdmin, type AuthRequest } from '../middleware.js';
import { config } from '../config.js';
import { insertDirectorySchema, updateDirectorySchema } from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import { buildRateLimiter } from '../middleware.js';
import { featureFlags } from '../features.js';
import jwt from 'jsonwebtoken';

const rlAdmin = buildRateLimiter({ windowMs: 60_000, max: 30 });

export function registerAdminRoutes(app: Express, storage: DBStorage): void {
  if (featureFlags.FEATURE_ADMIN) {
    // Admin Authentication
    app.post('/api/admin/auth', rlAdmin, async (req, res) => {
      try {
        const { password } = req.body;
        if (password === config.adminPassword) {
          // Issue a short-lived admin token via httpOnly cookie only
          const token = jwt.sign(
            { role: 'admin', via: 'password' },
            (config as any).jwtSecret || 'your-default-secret',
            {
              expiresIn: '2h',
            }
          );
          res
            .cookie('accessToken', token, {
              httpOnly: true,
              secure: config.isProduction,
              sameSite: 'strict',
              maxAge: 2 * 60 * 60 * 1000,
            })
            .json({ success: true });
        } else {
          res.status(401).json({ message: 'Invalid password' });
        }
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Directory password verification
    app.post('/api/directory/verify', rlAdmin, async (req, res) => {
      try {
        const { directoryName, password } = req.body;
        const isValid = await storage.verifyDirectoryPassword(directoryName, password);
        res.json({ success: isValid });
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Admin Directory Management
    app.get('/api/admin/directories', rlAdmin, requireAdmin, async (req, res) => {
      try {
        const directories = await storage.getDirectories();
        res.json(directories);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.post('/api/admin/directories', rlAdmin, requireAdmin, async (req, res) => {
      try {
        const { adminPassword, ...directoryData } = req.body; // adminPassword ignored by middleware
        const validatedData = insertDirectorySchema.parse(directoryData);
        const directory = await storage.createDirectory(validatedData);
        res.status(201).json(directory);
      } catch (error) {
        res.status(400).json({ message: 'Invalid directory data' });
      }
    });

    app.patch('/api/admin/directories/:id', rlAdmin, requireAdmin, async (req, res) => {
      try {
        const { adminPassword, ...updateData } = req.body;
        const id = parseInt(req.params.id);
        const validatedData = updateDirectorySchema.parse(updateData);
        const directory = await storage.updateDirectory(id, validatedData);
        if (!directory) {
          return res.status(404).json({ message: 'Directory not found' });
        }
        res.json(directory);
      } catch (error) {
        res.status(400).json({ message: 'Invalid directory data' });
      }
    });

    app.delete('/api/admin/directories/:id', rlAdmin, requireAdmin, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const deleted = await storage.deleteDirectory(id);
        if (!deleted) {
          return res.status(404).json({ message: 'Directory not found' });
        }
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });
  }
}
