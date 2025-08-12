import express, { type Express } from "express";
import path from "path";

export function serveStatic(app: Express) {
  const publicPath = path.join(process.cwd(), "dist", "public");

  // Serve static files from the dist/public directory at /papyr-us path
  app.use("/", express.static(publicPath));
  
  // Also serve assets directly at /assets for direct asset requests
  app.use("/assets", express.static(path.join(publicPath, "assets")));
  
  // Handle client-side routing - serve index.html for all /papyr-us routes
  app.get("/*", (req, res) => {
    const indexPath = path.join(publicPath, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(500).json({ message: "Error serving application" });
      }
    });
  });
  
  
  
  
}