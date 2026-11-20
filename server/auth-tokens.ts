import jwt from 'jsonwebtoken';
import { config } from './config.js';

/**
 * Verifies `token` as an access token and returns its payload; throws otherwise.
 *
 * Access and refresh tokens are signed with the same secret. A refresh token only buys new
 * tokens at POST /api/auth/refresh and outlives an access token by weeks, so it must never be
 * accepted where a session is checked: REST middleware, the Socket.IO namespaces and the
 * collaboration server all verify through this function.
 */
export function verifyAccessToken(token: string): any {
  const payload = jwt.verify(token, config.jwtSecret);
  if (!payload || typeof payload !== 'object' || (payload as any).type === 'refresh') {
    throw new Error('Not an access token');
  }
  return payload;
}
