import express, { type Express } from "express";
import path from "path";

export function serveStatic(app: Express) {
  // Use process.cwd() to get the current working directory
  const publicPath = path.join(process.cwd(), "dist", "public");
  
  // Serve static files from the dist/public directory
  app.use(express.static(publicPath));
  
  // Handle client-side routing - serve index.html for all non-API routes
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ message: "API endpoint not found" });
    }
    
    const indexPath = path.join(publicPath, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(500).json({ message: "Error serving application" });
      }
    });
  });
}