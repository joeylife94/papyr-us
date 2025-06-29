import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWikiPageSchema, updateWikiPageSchema, searchSchema, insertCalendarEventSchema, updateCalendarEventSchema, insertDirectorySchema, updateDirectorySchema } from "@shared/schema";


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
      res.json(events);
    } catch (error) {
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
      const eventData = insertCalendarEventSchema.parse(req.body);
      const event = await storage.createCalendarEvent(eventData);
      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ message: "Invalid event data" });
    }
  });

  app.patch("/api/calendar/event/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = updateCalendarEventSchema.parse(req.body);
      const event = await storage.updateCalendarEvent(id, updateData);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
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

  // Admin Authentication
  app.post("/api/admin/auth", async (req, res) => {
    try {
      const { password } = req.body;
      if (password === "404vibe!") {
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
      if (adminPassword !== "404vibe!") {
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
      if (adminPassword !== "404vibe!") {
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
      if (adminPassword !== "404vibe!") {
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
      if (adminPassword !== "404vibe!") {
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



  const httpServer = createServer(app);
  return httpServer;
}
