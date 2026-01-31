/**
 * Audit Log Service
 * 
 * Tracks user activities for security and compliance:
 * - Authentication events (login, logout, failed attempts)
 * - Data access and modifications
 * - Admin actions
 * - Permission changes
 */

import type { Pool } from 'pg';
import logger from './logger.js';
import type { Request, Response, NextFunction } from 'express';

// Audit event types
export enum AuditEventType {
  // Authentication
  AUTH_LOGIN = 'auth.login',
  AUTH_LOGIN_FAILED = 'auth.login.failed',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_REGISTER = 'auth.register',
  AUTH_PASSWORD_CHANGE = 'auth.password_change',
  AUTH_PASSWORD_RESET_REQUEST = 'auth.password_reset_request',
  AUTH_PASSWORD_RESET_COMPLETE = 'auth.password_reset_complete',
  AUTH_TOKEN_REFRESH = 'auth.token_refresh',
  AUTH_MFA_ENABLED = 'auth.mfa_enabled',
  AUTH_MFA_DISABLED = 'auth.mfa_disabled',

  // User management
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_ROLE_CHANGED = 'user.role_changed',

  // Page operations
  PAGE_CREATED = 'page.created',
  PAGE_UPDATED = 'page.updated',
  PAGE_DELETED = 'page.deleted',
  PAGE_VIEWED = 'page.viewed',
  PAGE_PERMISSION_CHANGED = 'page.permission_changed',
  PAGE_SHARED = 'page.shared',

  // Team operations
  TEAM_CREATED = 'team.created',
  TEAM_UPDATED = 'team.updated',
  TEAM_DELETED = 'team.deleted',
  TEAM_MEMBER_ADDED = 'team.member_added',
  TEAM_MEMBER_REMOVED = 'team.member_removed',
  TEAM_ROLE_CHANGED = 'team.role_changed',

  // Admin actions
  ADMIN_SETTINGS_CHANGED = 'admin.settings_changed',
  ADMIN_USER_IMPERSONATION = 'admin.user_impersonation',
  ADMIN_DATA_EXPORT = 'admin.data_export',
  ADMIN_BACKUP_CREATED = 'admin.backup_created',

  // Security events
  SECURITY_SUSPICIOUS_ACTIVITY = 'security.suspicious_activity',
  SECURITY_RATE_LIMIT_EXCEEDED = 'security.rate_limit_exceeded',
  SECURITY_PERMISSION_DENIED = 'security.permission_denied',

  // API events
  API_KEY_CREATED = 'api.key_created',
  API_KEY_REVOKED = 'api.key_revoked',
  API_REQUEST = 'api.request',
}

// Audit log entry structure
interface AuditLogEntry {
  eventType: AuditEventType;
  userId?: number | null;
  userEmail?: string | null;
  targetType?: string | null;      // e.g., 'page', 'user', 'team'
  targetId?: number | string | null;
  action: string;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  timestamp: Date;
  success: boolean;
}

// Buffer entry with pool reference
interface BufferedEntry extends Omit<AuditLogEntry, 'timestamp'> {
  timestamp: Date;
  pool: Pool;
}

// In-memory buffer for batch inserts
const auditBuffer: BufferedEntry[] = [];
const BUFFER_FLUSH_INTERVAL = parseInt(process.env.AUDIT_LOG_FLUSH_INTERVAL || '5000', 10);
const BUFFER_MAX_SIZE = 100;
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Create audit log table if not exists
 */
export async function initAuditLogTable(pool: Pool): Promise<void> {
  if (process.env.AUDIT_LOG_ENABLED === 'false') {
    logger.info('Audit logging disabled');
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        user_id INTEGER,
        user_email VARCHAR(255),
        target_type VARCHAR(50),
        target_id VARCHAR(100),
        action VARCHAR(255) NOT NULL,
        details JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        request_id VARCHAR(36),
        success BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes if they don't exist
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id)`);
    
    logger.info('Audit log table initialized');
    
    // Start flush timer
    if (!flushTimer) {
      flushTimer = setInterval(flushAuditBuffer, BUFFER_FLUSH_INTERVAL);
    }
  } catch (error) {
    logger.error('Failed to initialize audit log table', { error });
  }
}

/**
 * Flush audit buffer to database
 */
async function flushAuditBuffer(): Promise<void> {
  if (auditBuffer.length === 0) return;

  const entries = auditBuffer.splice(0, auditBuffer.length);

  // Group by pool (in case multiple pools are used)
  const poolGroups = new Map<Pool, BufferedEntry[]>();
  for (const entry of entries) {
    const group = poolGroups.get(entry.pool) || [];
    group.push(entry);
    poolGroups.set(entry.pool, group);
  }

  for (const [pool, groupEntries] of Array.from(poolGroups.entries())) {
    try {
      // Build batch insert query
      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const entry of groupEntries) {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11})`);
        params.push(
          entry.eventType,
          entry.userId ?? null,
          entry.userEmail ?? null,
          entry.targetType ?? null,
          entry.targetId?.toString() ?? null,
          entry.action,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.ipAddress ?? null,
          entry.userAgent ?? null,
          entry.requestId ?? null,
          entry.success,
          entry.timestamp
        );
        paramIndex += 12;
      }

      const query = `
        INSERT INTO audit_logs (
          event_type, user_id, user_email, target_type, target_id,
          action, details, ip_address, user_agent, request_id, success, created_at
        ) VALUES ${values.join(', ')}
      `;

      await pool.query(query, params);
      logger.debug('Flushed audit buffer', { count: groupEntries.length });
    } catch (error) {
      logger.error('Failed to flush audit buffer', { error, count: groupEntries.length });
      // Re-add entries on failure (with limit to prevent memory issues)
      if (auditBuffer.length < BUFFER_MAX_SIZE * 2) {
        auditBuffer.push(...groupEntries);
      }
    }
  }
}

// Flush on process exit
process.on('beforeExit', () => {
  flushAuditBuffer().catch(err => {
    console.error('Error flushing audit buffer on exit:', err);
  });
});

/**
 * Log an audit event
 */
export function logAuditEvent(entry: {
  pool: Pool;
  eventType: AuditEventType;
  userId?: number | null;
  userEmail?: string | null;
  targetType?: string | null;
  targetId?: number | string | null;
  action?: string;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  success?: boolean;
}): void {
  if (process.env.AUDIT_LOG_ENABLED === 'false') return;

  const fullEntry: BufferedEntry = {
    pool: entry.pool,
    eventType: entry.eventType,
    userId: entry.userId ?? null,
    userEmail: entry.userEmail ?? null,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    action: entry.action || entry.eventType,
    details: entry.details ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    requestId: entry.requestId ?? null,
    timestamp: new Date(),
    success: entry.success ?? true,
  };

  // Add to buffer
  auditBuffer.push(fullEntry);

  // Flush if buffer is full
  if (auditBuffer.length >= BUFFER_MAX_SIZE) {
    flushAuditBuffer().catch(err => {
      logger.error('Error flushing audit buffer', { error: err });
    });
  }

  // Also log to standard logger for immediate visibility in non-production
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Audit event', {
      eventType: entry.eventType,
      userId: entry.userId,
      action: entry.action || entry.eventType,
      success: entry.success ?? true,
    });
  }
}

/**
 * Helper to extract audit context from request
 */
export function getAuditContext(req: Request): {
  userId: number | null;
  userEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
} {
  const user = (req as any).user;
  
  return {
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('User-Agent') || null,
    requestId: req.get('X-Request-ID') || (req as any).requestId || null,
  };
}

/**
 * Middleware to automatically log API requests
 */
export function auditMiddleware(pool: Pool) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.AUDIT_LOG_ENABLED === 'false') {
      return next();
    }

    // Skip non-API routes and health checks
    if (!req.path.startsWith('/api') || req.path === '/api/health' || req.path === '/health') {
      return next();
    }

    const context = getAuditContext(req);
    const startTime = Date.now();
    
    // Log after response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const success = res.statusCode < 400;
      
      // Only log write operations and auth endpoints in detail
      const isWriteOp = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      const isAuthEndpoint = req.path.startsWith('/api/auth');
      
      if (isWriteOp || isAuthEndpoint) {
        logAuditEvent({
          pool,
          eventType: AuditEventType.API_REQUEST,
          ...context,
          action: `${req.method} ${req.path}`,
          details: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
            // Don't log request body for security (might contain passwords)
          },
          success,
        });
      }
    });
    
    next();
  };
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(pool: Pool, options: {
  userId?: number;
  eventType?: AuditEventType;
  targetType?: string;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const conditions: string[] = ['1=1'];
  const params: any[] = [];
  let paramIndex = 1;
  
  if (options.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(options.userId);
  }
  if (options.eventType) {
    conditions.push(`event_type = $${paramIndex++}`);
    params.push(options.eventType);
  }
  if (options.targetType) {
    conditions.push(`target_type = $${paramIndex++}`);
    params.push(options.targetType);
  }
  if (options.targetId) {
    conditions.push(`target_id = $${paramIndex++}`);
    params.push(options.targetId);
  }
  if (options.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(options.startDate);
  }
  if (options.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(options.endDate);
  }
  
  const limit = options.limit || 100;
  const offset = options.offset || 0;
  
  params.push(limit, offset);
  
  const result = await pool.query(`
    SELECT * FROM audit_logs
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `, params);
  
  return result.rows;
}

/**
 * Get audit summary for a user
 */
export async function getUserAuditSummary(pool: Pool, userId: number, days: number = 30): Promise<any[]> {
  const result = await pool.query(`
    SELECT 
      event_type,
      COUNT(*) as count,
      MAX(created_at) as last_occurrence
    FROM audit_logs
    WHERE user_id = $1
      AND created_at >= NOW() - INTERVAL '1 day' * $2
    GROUP BY event_type
    ORDER BY count DESC
  `, [userId, days]);
  
  return result.rows;
}

export type { AuditLogEntry };
