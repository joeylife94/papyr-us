/**
 * CDN & Static Asset Configuration
 * 
 * Configures static asset serving with CDN support:
 * - Cache headers for different asset types
 * - CDN URL rewriting
 * - Asset fingerprinting support
 */

import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

// CDN configuration from environment
const cdnConfig = {
  // CDN base URL (e.g., https://cdn.example.com or CloudFront distribution)
  cdnUrl: process.env.CDN_URL || '',
  
  // Enable CDN rewrites
  enabled: !!process.env.CDN_URL,
  
  // Cache durations (in seconds)
  cacheDurations: {
    // Immutable assets (hashed filenames) - 1 year
    immutable: 31536000,
    // Static assets (images, fonts) - 1 week
    static: 604800,
    // HTML/dynamic content - no cache or short
    dynamic: 0,
    // API responses - no cache by default
    api: 0,
  },
};

/**
 * Get appropriate cache control header based on file type
 */
function getCacheControl(path: string): string {
  // Hashed assets (Vite build outputs with hash in filename)
  if (/\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot)$/i.test(path)) {
    return `public, max-age=${cdnConfig.cacheDurations.immutable}, immutable`;
  }
  
  // JavaScript and CSS (non-hashed)
  if (/\.(js|css)$/i.test(path)) {
    return `public, max-age=${cdnConfig.cacheDurations.static}, stale-while-revalidate=86400`;
  }
  
  // Images
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(path)) {
    return `public, max-age=${cdnConfig.cacheDurations.static}, stale-while-revalidate=86400`;
  }
  
  // Fonts
  if (/\.(woff2?|ttf|eot|otf)$/i.test(path)) {
    return `public, max-age=${cdnConfig.cacheDurations.immutable}, immutable`;
  }
  
  // HTML - short cache with revalidation
  if (/\.html?$/i.test(path) || path === '/' || !path.includes('.')) {
    return 'no-cache, must-revalidate';
  }
  
  // Default
  return `public, max-age=${cdnConfig.cacheDurations.static}`;
}

/**
 * Middleware to add cache control headers for static assets
 */
export function cacheControlMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip for API routes
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  }
  
  // Set cache control based on path
  const cacheControl = getCacheControl(req.path);
  res.setHeader('Cache-Control', cacheControl);
  
  // Add Vary header for proper CDN caching
  res.setHeader('Vary', 'Accept-Encoding');
  
  next();
}

/**
 * Helper to generate CDN URL for an asset
 */
export function getCdnUrl(assetPath: string): string {
  if (!cdnConfig.enabled || !cdnConfig.cdnUrl) {
    return assetPath;
  }
  
  // Ensure path starts with /
  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  
  // Combine CDN URL with path
  return `${cdnConfig.cdnUrl}${normalizedPath}`;
}

/**
 * Generate preload hints for critical assets
 */
export function generatePreloadHints(): string[] {
  const hints: string[] = [];
  
  // Critical CSS
  hints.push('<link rel="preload" href="/assets/index.css" as="style">');
  
  // Critical fonts (if any)
  // hints.push('<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>');
  
  return hints;
}

/**
 * Security headers for static assets
 */
export function staticSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Only for non-HTML static assets
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|eot)$/i)) {
    // Cross-origin isolation for performance APIs
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  
  next();
}

export { cdnConfig };
