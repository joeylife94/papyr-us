import type { Express } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import type { DBStorage } from './storage.js';
import { getRedisClient, isRedisEnabled } from './services/redis.js';
import { isAIAvailable } from './services/ai.js';

function getBuildIdentity() {
  return {
    version: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
    revision: process.env.GIT_REVISION || process.env.GITHUB_SHA || 'unknown',
  };
}

function getUploadsDirectory(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), 'server', 'uploads');
}

let draining = false;

/**
 * Called when the process starts shutting down: from then on /ready answers 503, so a load
 * balancer stops routing new requests here while in-flight ones finish. /health is unaffected.
 */
export function markShuttingDown(): void {
  draining = true;
}

/** Test hook. */
export function resetShutdownState(): void {
  draining = false;
}

async function checkDependencies(storage: Pick<DBStorage, 'pool'>) {
  let database = 'degraded';
  let redis = isRedisEnabled() ? 'degraded' : 'disabled';
  let uploads = 'degraded';

  try {
    await storage.pool.query('SELECT 1');
    database = 'ready';
  } catch {
    database = 'degraded';
  }

  if (isRedisEnabled()) {
    try {
      const client = await getRedisClient();
      if (client && (await client.ping()) === 'PONG') {
        redis = 'ready';
      }
    } catch {
      redis = 'degraded';
    }
  }

  try {
    const uploadsDir = getUploadsDirectory();
    await fs.mkdir(path.join(uploadsDir, 'images'), { recursive: true });
    await fs.mkdir(path.join(uploadsDir, 'files'), { recursive: true });
    await fs.access(uploadsDir, fsConstants.R_OK | fsConstants.W_OK);
    uploads = 'ready';
  } catch {
    uploads = 'degraded';
  }

  const healthy =
    database === 'ready' && uploads === 'ready' && (redis === 'ready' || redis === 'disabled');
  return { healthy, database, redis, uploads };
}

/**
 * The only health endpoints (issue #124 X0):
 * - `/health`: dependency status with build identity, 200 when PostgreSQL, uploads and Redis
 *   (when enabled) work, else 503. Container health checks use it.
 * - `/ready`: whether this instance should receive traffic: the same dependencies, and not
 *   shutting down. Minimal body, for load balancers and orchestrators.
 */
export function registerOperationalRoutes(app: Express, storage: Pick<DBStorage, 'pool'>): void {
  app.get('/version', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'papyr-us',
      ...getBuildIdentity(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  app.get('/health', async (_req, res) => {
    const { healthy, database, redis, uploads } = await checkDependencies(storage);

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      service: 'papyr-us',
      ...getBuildIdentity(),
      database,
      redis,
      uploads,
      ai: isAIAvailable() ? 'ready' : 'optional',
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get('/ready', async (_req, res) => {
    if (draining) {
      return res.status(503).json({ status: 'not_ready', reason: 'shutting_down' });
    }
    const { healthy, database, redis, uploads } = await checkDependencies(storage);
    if (!healthy) {
      return res.status(503).json({ status: 'not_ready', database, redis, uploads });
    }
    return res.json({ status: 'ready' });
  });
}
