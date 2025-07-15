import express, { type Express } from "express";
import path from "path";

export function serveStatic(app: Express) {
  const publicPath = path.join(process.cwd(), "dist", "public");

  // Serve static files from the dist/public directory at /papyr-us path
  app.use("/papyr-us", express.static(publicPath));
  
  // Also serve assets directly at /assets for direct asset requests
  app.use("/assets", express.static(path.join(publicPath, "assets")));
  
  // Handle client-side routing - serve index.html for all /papyr-us routes
  app.get("/papyr-us/*", (req, res) => {
    const indexPath = path.join(publicPath, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(500).json({ message: "Error serving application" });
      }
    });
  });
  
  // Redirect root to /papyr-us for convenience
  app.get("/", (req, res) => {
    res.redirect("/papyr-us/");
  });
  
  // Handle remaining routes (for API 404s)
  app.get("*", (req, res) => {
    if (req.path.startsWith("/papyr-us/api")) {
      return res.status(404).json({ message: "API endpoint not found" });
    }
    
    // For other paths, redirect to papyr-us
    res.redirect("/papyr-us/");
  });
}