import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.ts";
import { config } from "./config.ts";
import { insertWikiPageSchema, updateWikiPageSchema, searchSchema, insertCalendarEventSchema, updateCalendarEventSchema, insertDirectorySchema, updateDirectorySchema, insertCommentSchema, updateCommentSchema, insertMemberSchema, updateMemberSchema } from "../shared/schema.ts";
import { upload, processUploadedFile, deleteUploadedFile, listUploadedFiles, getFileInfo } from "./services/upload.ts";
import path from "path";
import { existsSync } from "fs";
import type { Request } from "express";

interface MulterRequest extends Request {
  files?: any[];
}


export async function registerRoutes(app: Express): Promise<Server> {
  // Wiki Pages API
  app.get("/api/pages", async (req, res) => {
    try {
      const searchParams = searchSchema.parse({
        query: req.query.q as string,
        folder: req.query.folder as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      });

      const result = await storage.searchWikiPages(searchParams);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: "Invalid search parameters" });
    }
  });

  app.get("/api/pages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const page = await storage.getWikiPage(id);
      
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      
      res.json(page);
    } catch (error) {
      res.status(400).json({ message: "Invalid page ID" });
    }
  });

  app.get("/api/pages/slug/:slug", async (req, res) => {
    try {
      const slug = req.params.slug;
      const page = await storage.getWikiPageBySlug(slug);
      
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      
      res.json(page);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/pages", async (req, res) => {
    try {
      const pageData = insertWikiPageSchema.parse(req.body);
      const page = await storage.createWikiPage(pageData);
      res.status(201).json(page);
    } catch (error) {
      res.status(400).json({ message: "Invalid page data", error });
    }
  });

  app.put("/api/pages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = updateWikiPageSchema.parse(req.body);
      const page = await storage.updateWikiPage(id, updateData);
      
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      
      res.json(page);
    } catch (error) {
      res.status(400).json({ message: "Invalid update data", error });
    }
  });

  app.delete("/api/pages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteWikiPage(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Page not found" });
      }
      
      res.json({ message: "Page deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid page ID" });
    }
  });

  // Folder and Tag APIs
  app.get("/api/folders", async (req, res) => {
    try {
      const folders = await storage.getFolders();
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/folders/:folder/pages", async (req, res) => {
    try {
      const folder = req.params.folder;
      const pages = await storage.getWikiPagesByFolder(folder);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/tags", async (req, res) => {
    try {
      const tags = await storage.getAllTags();
      res.json(tags);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Calendar Events API
  app.get("/api/calendar/:teamId", async (req, res) => {
    try {
      const teamId = req.params.teamId;
      const events = await storage.getCalendarEvents(teamId);
      
      // Ensure compatibility with new fields - add defaults if missing
      const safeEvents = events.map(event => ({
        ...event,
        startTime: event.startTime || null,
        endTime: event.endTime || null,
        priority: event.priority || 1
      }));
      
      res.json(safeEvents);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/calendar/event/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getCalendarEvent(id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/calendar", async (req, res) => {
    try {
      console.log("Received calendar event data:", req.body);
      
      // Convert ISO string dates to Date objects
      const requestData = { ...req.body };
      if (requestData.startDate && typeof requestData.startDate === 'string') {
        requestData.startDate = new Date(requestData.startDate);
      }
      if (requestData.endDate && typeof requestData.endDate === 'string') {
        requestData.endDate = new Date(requestData.endDate);
      }
      
      // If endDate is not provided or is null, set it to startDate
      if (!requestData.endDate && requestData.startDate) {
        requestData.endDate = new Date(requestData.startDate);
        console.log("Set endDate to startDate");
      }
      
      // Handle time fields - convert empty strings to null
      if (requestData.startTime === '' || requestData.startTime === undefined) {
        requestData.startTime = null;
      }
      if (requestData.endTime === '' || requestData.endTime === undefined) {
        requestData.endTime = null;
      }
      
      // Handle priority field - convert to integer and set default
      if (!requestData.priority || requestData.priority === undefined) {
        requestData.priority = 1;
      } else {
        requestData.priority = parseInt(requestData.priority);
      }
      
      console.log("Converted date data:", requestData);
      const eventData = insertCalendarEventSchema.parse(requestData);
      console.log("Parsed event data:", eventData);
      const event = await storage.createCalendarEvent(eventData);
      res.status(201).json(event);
    } catch (error: any) {
      console.error("Calendar event creation error:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          message: "Invalid event data",
          errors: error.errors 
        });
      }
      res.status(400).json({ message: "Invalid event data" });
    }
  });

  app.patch("/api/calendar/event/:id", async (req, res) => {
    try {
      console.log("Received calendar event update data:", req.body);
      
      const id = parseInt(req.params.id);
      
      // Convert ISO string dates to Date objects (same logic as POST)
      const requestData = { ...req.body };
      if (requestData.startDate && typeof requestData.startDate === 'string') {
        requestData.startDate = new Date(requestData.startDate);
      }
      if (requestData.endDate && typeof requestData.endDate === 'string') {
        requestData.endDate = new Date(requestData.endDate);
      }
      
      // If endDate is not provided or is null, set it to startDate
      if (!requestData.endDate && requestData.startDate) {
        requestData.endDate = new Date(requestData.startDate);
        console.log("Set endDate to startDate for update");
      }
      
      // Handle time fields - convert empty strings to null
      if (requestData.startTime === '' || requestData.startTime === undefined) {
        requestData.startTime = null;
      }
      if (requestData.endTime === '' || requestData.endTime === undefined) {
        requestData.endTime = null;
      }
      
      // Handle priority field - convert to integer and set default
      if (!requestData.priority || requestData.priority === undefined) {
        requestData.priority = 1;
      } else {
        requestData.priority = parseInt(requestData.priority);
      }
      
      console.log("Converted update data:", requestData);
      const updateData = updateCalendarEventSchema.parse(requestData);
      console.log("Parsed update data:", updateData);
      const event = await storage.updateCalendarEvent(id, updateData);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error: any) {
      console.error("Calendar event update error:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          message: "Invalid event data",
          errors: error.errors 
        });
      }
      res.status(400).json({ message: "Invalid event data" });
    }
  });

  app.delete("/api/calendar/event/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCalendarEvent(id);
      if (!deleted) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Comments API
  app.get("/api/pages/:pageId/comments", async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const comments = await storage.getCommentsByPageId(pageId);
      res.json(comments);
    } catch (error) {
      res.status(400).json({ message: "Invalid page ID" });
    }
  });

  app.post("/api/pages/:pageId/comments", async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const commentData = insertCommentSchema.parse({
        ...req.body,
        pageId
      });
      const comment = await storage.createComment(commentData);
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment data", error });
    }
  });

  app.put("/api/comments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = updateCommentSchema.parse(req.body);
      const comment = await storage.updateComment(id, updateData);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      res.json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid update data", error });
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteComment(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      res.json({ message: "Comment deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid comment ID" });
    }
  });

  // Members API
  app.get("/api/members", async (req, res) => {
    try {
      const members = await storage.getMembers();
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/members/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const member = await storage.getMember(id);
      
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      res.json(member);
    } catch (error) {
      res.status(400).json({ message: "Invalid member ID" });
    }
  });

  app.get("/api/members/email/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const member = await storage.getMemberByEmail(email);
      
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      res.json(member);
    } catch (error) {
      res.status(400).json({ message: "Invalid email" });
    }
  });

  app.post("/api/members", async (req, res) => {
    try {
      const memberData = insertMemberSchema.parse(req.body);
      const member = await storage.createMember(memberData);
      res.status(201).json(member);
    } catch (error) {
      res.status(400).json({ message: "Invalid member data", error });
    }
  });

  app.put("/api/members/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = updateMemberSchema.parse(req.body);
      const member = await storage.updateMember(id, updateData);
      
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      res.json(member);
    } catch (error) {
      res.status(400).json({ message: "Invalid update data", error });
    }
  });

  app.delete("/api/members/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteMember(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      res.json({ message: "Member deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid member ID" });
    }
  });

  // File Upload API
  app.post("/api/upload", upload.array('files', 5), async (req: any, res) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const uploadedFiles = await Promise.all(
        req.files.map((file: any) => processUploadedFile(file))
      );

      res.status(201).json({
        message: `${uploadedFiles.length} file(s) uploaded successfully`,
        files: uploadedFiles
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(400).json({ 
        message: "Upload failed", 
        error: error.message 
      });
    }
  });

  // Serve uploaded images
  app.get("/api/uploads/images/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const fileInfo = await getFileInfo(filename, true);
      
      if (!fileInfo || !existsSync(fileInfo.path)) {
        return res.status(404).json({ message: "Image not found" });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      
      res.sendFile(path.resolve(fileInfo.path));
    } catch (error) {
      res.status(500).json({ message: "Error serving image" });
    }
  });

  // Serve uploaded files
  app.get("/api/uploads/files/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const fileInfo = await getFileInfo(filename, false);
      
      if (!fileInfo || !existsSync(fileInfo.path)) {
        return res.status(404).json({ message: "File not found" });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.sendFile(path.resolve(fileInfo.path));
    } catch (error) {
      res.status(500).json({ message: "Error serving file" });
    }
  });

  // List uploaded files
  app.get("/api/uploads", async (req, res) => {
    try {
      const fileList = await listUploadedFiles();
      res.json(fileList);
    } catch (error) {
      res.status(500).json({ message: "Error listing files" });
    }
  });

  // Delete uploaded file
  app.delete("/api/uploads/:type/:filename", async (req, res) => {
    try {
      const { type, filename } = req.params;
      const isImage = type === 'images';
      
      if (type !== 'images' && type !== 'files') {
        return res.status(400).json({ message: "Invalid file type" });
      }

      const deleted = await deleteUploadedFile(filename, isImage);
      
      if (!deleted) {
        return res.status(404).json({ message: "File not found" });
      }
      
      res.json({ message: "File deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting file" });
    }
  });

  // Admin Authentication
  app.post("/api/admin/auth", async (req, res) => {
    try {
      const { password } = req.body;
      if (password === config.adminPassword) {
        res.json({ success: true });
      } else {
        res.status(401).json({ message: "Invalid password" });
      }
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Directory password verification
  app.post("/api/directory/verify", async (req, res) => {
    try {
      const { directoryName, password } = req.body;
      const isValid = await storage.verifyDirectoryPassword(directoryName, password);
      res.json({ success: isValid });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Admin Directory Management
  app.get("/api/admin/directories", async (req, res) => {
    try {
      const { adminPassword } = req.query;
      if (adminPassword !== config.adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const directories = await storage.getDirectories();
      res.json(directories);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/directories", async (req, res) => {
    try {
      const { adminPassword, ...directoryData } = req.body;
      if (adminPassword !== config.adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const validatedData = insertDirectorySchema.parse(directoryData);
      const directory = await storage.createDirectory(validatedData);
      res.status(201).json(directory);
    } catch (error) {
      res.status(400).json({ message: "Invalid directory data" });
    }
  });

  app.patch("/api/admin/directories/:id", async (req, res) => {
    try {
      const { adminPassword, ...updateData } = req.body;
      if (adminPassword !== config.adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      const validatedData = updateDirectorySchema.parse(updateData);
      const directory = await storage.updateDirectory(id, validatedData);
      if (!directory) {
        return res.status(404).json({ message: "Directory not found" });
      }
      res.json(directory);
    } catch (error) {
      res.status(400).json({ message: "Invalid directory data" });
    }
  });

  app.delete("/api/admin/directories/:id", async (req, res) => {
    try {
      const { adminPassword } = req.body;
      if (adminPassword !== config.adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteDirectory(id);
      if (!deleted) {
        return res.status(404).json({ message: "Directory not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Dashboard API
  app.get("/api/dashboard/overview", async (req, res) => {
    try {
      const overview = await storage.getDashboardOverview();
      res.json(overview);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/dashboard/team/:teamId", async (req, res) => {
    try {
      const teamId = req.params.teamId;
      const stats = await storage.getTeamProgressStats(teamId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/dashboard/member/:memberId", async (req, res) => {
    try {
      const memberId = parseInt(req.params.memberId);
      const stats = await storage.getMemberProgressStats(memberId);
      if (!stats) {
        return res.status(404).json({ message: "Member stats not found" });
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
