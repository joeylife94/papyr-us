import type { Express } from 'express';
import {
  authMiddleware,
  requireAuthIfEnabled,
  requireTeamMembership,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { config } from '../config.js';
import { DBStorage } from '../storage.js';
import { buildRateLimiter } from '../middleware.js';
import {
  upload,
  processUploadedFile,
  deleteUploadedFile,
  listUploadedFiles,
  getFileInfo,
  getFileTeamId,
} from '../services/upload.js';
import path from 'path';
import { existsSync } from 'fs';

interface MulterRequest extends AuthRequest {
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

const rlUpload = buildRateLimiter({ windowMs: 60_000, max: 30 });

export function registerUploadsRoutes(app: Express, storage: DBStorage): void {
  app.post(
    '/api/upload',
    rlUpload,
    requireAuthIfEnabled,
    requireTeamMembership,
    upload.array('files', 5),
    async (req: MulterRequest, res) => {
      try {
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
          return res.status(400).json({ message: 'No files uploaded' });
        }

        const teamId = req.body.teamId;
        const uploadedFiles = await Promise.all(
          (req.files as Express.Multer.File[]).map((file: Express.Multer.File) => processUploadedFile(file, teamId))
        );

        res.status(201).json({
          message: `${uploadedFiles.length} file(s) uploaded successfully`,
          files: uploadedFiles,
        });
      } catch (error) {
        console.error('Upload error:', error);
        res.status(400).json({
          message: 'Upload failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Serve uploaded images
  app.get('/api/uploads/images/:filename', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { filename } = req.params;

      const fileTeamId = await getFileTeamId(filename, true);

      // Fail-secure: sidecar missing or unreadable — deny rather than silently allow
      if (fileTeamId === undefined) {
        return res.status(403).json({ message: 'File metadata unavailable' });
      }

      // File belongs to a specific team — verify membership
      if (fileTeamId !== null) {
        if (!req.user?.id) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.map(String).includes(fileTeamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      }
      // fileTeamId === null — explicitly public file — proceed

      const fileInfo = await getFileInfo(filename, true);

      if (!fileInfo || !existsSync(fileInfo.path)) {
        return res.status(404).json({ message: 'Image not found' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Cache-Control', 'private, max-age=3600');

      res.sendFile(path.resolve(fileInfo.path));
    } catch (error) {
      res.status(500).json({ message: 'Error serving image' });
    }
  });

  // Serve uploaded files
  app.get('/api/uploads/files/:filename', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { filename } = req.params;

      const fileTeamId = await getFileTeamId(filename, false);

      // Fail-secure: sidecar missing or unreadable — deny rather than silently allow
      if (fileTeamId === undefined) {
        return res.status(403).json({ message: 'File metadata unavailable' });
      }

      // File belongs to a specific team — verify membership
      if (fileTeamId !== null) {
        if (!req.user?.id) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.map(String).includes(fileTeamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      }
      // fileTeamId === null — explicitly public file — proceed

      const fileInfo = await getFileInfo(filename, false);

      if (!fileInfo || !existsSync(fileInfo.path)) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.sendFile(path.resolve(fileInfo.path));
    } catch (error) {
      res.status(500).json({ message: 'Error serving file' });
    }
  });

  // List uploaded files
  app.get('/api/uploads', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId as string | undefined;

      if (!teamId) {
        // No teamId specified — scope to user's teams to prevent full data leak
        const userTeamIds = req.userTeamIds;
        if (userTeamIds && userTeamIds.length > 0) {
          const allLists = await Promise.all(
            userTeamIds.map((tid) => listUploadedFiles(String(tid)))
          );
          return res.json({
            images: allLists.flatMap((l) => l.images),
            files: allLists.flatMap((l) => l.files),
          });
        }
        return res.json({ images: [], files: [] });
      }

      const fileList = await listUploadedFiles(teamId);
      res.json(fileList);
    } catch (error) {
      res.status(500).json({ message: 'Error listing files' });
    }
  });

  // Delete uploaded file
  app.delete(
    '/api/uploads/:type/:filename',
    requireAuthIfEnabled,
    async (req: AuthRequest, res) => {
      try {
        const { type, filename } = req.params;
        const isImg = type === 'images';

        if (type !== 'images' && type !== 'files') {
          return res.status(400).json({ message: 'Invalid file type' });
        }

        // Verify the requester belongs to the team that uploaded this file
        const fileTeamId = await getFileTeamId(filename, isImg);
        if (fileTeamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.map(String).includes(fileTeamId)) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (fileTeamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        const deleted = await deleteUploadedFile(filename, isImg);

        if (!deleted) {
          return res.status(404).json({ message: 'File not found' });
        }

        res.json({ message: 'File deleted successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Error deleting file' });
      }
    }
  );
}
