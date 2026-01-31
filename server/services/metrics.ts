import promClient from 'prom-client';
import type { Express, Request, Response, NextFunction } from 'express';
import logger from './logger.js';

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
promClient.collectDefaultMetrics({
  register,
  prefix: 'papyrus_',
});

// ==================== Custom Metrics ====================

// HTTP Request Duration Histogram
const httpRequestDuration = new promClient.Histogram({
  name: 'papyrus_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// HTTP Request Counter
const httpRequestsTotal = new promClient.Counter({
  name: 'papyrus_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Active Connections Gauge
const activeConnections = new promClient.Gauge({
  name: 'papyrus_active_connections',
  help: 'Number of active connections',
  registers: [register],
});

// Database Query Duration Histogram
const dbQueryDuration = new promClient.Histogram({
  name: 'papyrus_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

// WebSocket Connections Gauge
const wsConnections = new promClient.Gauge({
  name: 'papyrus_websocket_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['namespace'],
  registers: [register],
});

// AI API Calls Counter
const aiApiCalls = new promClient.Counter({
  name: 'papyrus_ai_api_calls_total',
  help: 'Total number of AI API calls',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// AI API Latency Histogram
const aiApiLatency = new promClient.Histogram({
  name: 'papyrus_ai_api_latency_seconds',
  help: 'Latency of AI API calls in seconds',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// Error Counter
const errorsTotal = new promClient.Counter({
  name: 'papyrus_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'code'],
  registers: [register],
});

// Business Metrics
const pagesCreated = new promClient.Counter({
  name: 'papyrus_pages_created_total',
  help: 'Total number of pages created',
  registers: [register],
});

const usersRegistered = new promClient.Counter({
  name: 'papyrus_users_registered_total',
  help: 'Total number of users registered',
  registers: [register],
});

const teamsCreated = new promClient.Counter({
  name: 'papyrus_teams_created_total',
  help: 'Total number of teams created',
  registers: [register],
});

// ==================== Middleware ====================

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  // Track active connections
  activeConnections.inc();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationInSeconds = Number(end - start) / 1e9;

    // Normalize route for metrics (replace IDs with :id)
    const route = normalizeRoute(req.route?.path || req.path);

    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    };

    httpRequestDuration.observe(labels, durationInSeconds);
    httpRequestsTotal.inc(labels);
    activeConnections.dec();
  });

  next();
}

/**
 * Normalize route path for consistent metrics labels
 */
function normalizeRoute(path: string): string {
  return path
    .replace(/\/\d+/g, '/:id') // Replace numeric IDs
    .replace(/\/[a-f0-9-]{36}/gi, '/:uuid') // Replace UUIDs
    .replace(/\/[a-z0-9-]+(?=\/|$)/gi, (match) => {
      // Keep known path segments, replace others
      const knownSegments = [
        'api',
        'auth',
        'pages',
        'teams',
        'members',
        'tasks',
        'comments',
        'files',
        'templates',
        'calendar',
        'notifications',
        'admin',
        'search',
        'ai',
        'health',
      ];
      return knownSegments.includes(match.slice(1)) ? match : '/:param';
    });
}

/**
 * Endpoint to expose metrics for Prometheus scraping
 */
export async function metricsEndpoint(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error generating metrics', { error });
    res.status(500).end();
  }
}

/**
 * Setup metrics endpoint
 */
export function setupMetrics(app: Express): void {
  app.get('/metrics', metricsEndpoint);
  logger.info('Prometheus metrics endpoint enabled at /metrics');
}

// ==================== Metric Helpers ====================

export const metrics = {
  // Database metrics
  dbQueryStart: (operation: string, table: string) => {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      const durationInSeconds = Number(end - start) / 1e9;
      dbQueryDuration.observe({ operation, table }, durationInSeconds);
    };
  },

  // WebSocket metrics
  wsConnectionOpened: (namespace: string) => wsConnections.inc({ namespace }),
  wsConnectionClosed: (namespace: string) => wsConnections.dec({ namespace }),

  // AI metrics
  aiCallStart: (operation: string) => {
    const start = process.hrtime.bigint();
    return (status: 'success' | 'error') => {
      const end = process.hrtime.bigint();
      const durationInSeconds = Number(end - start) / 1e9;
      aiApiLatency.observe({ operation }, durationInSeconds);
      aiApiCalls.inc({ operation, status });
    };
  },

  // Error tracking
  trackError: (type: string, code: string = 'unknown') => {
    errorsTotal.inc({ type, code });
  },

  // Business metrics
  trackPageCreated: () => pagesCreated.inc(),
  trackUserRegistered: () => usersRegistered.inc(),
  trackTeamCreated: () => teamsCreated.inc(),
};

export { register, promClient };
