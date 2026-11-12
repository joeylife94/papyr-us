/**
 * Platform admin organization routes (issue #124 X1c): /api/admin/organizations*, each behind
 * requireAdmin. Registered in server/index.ts only when FEATURE_ADMIN is on.
 */
import type { Express } from 'express';
import type { DBStorage } from './storage.js';

export function registerOrganizationAdminRoutes(_app: Express, _storage: DBStorage) {
  // X1c P1 adds the /api/admin/organizations routes here.
}
