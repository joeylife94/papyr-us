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

/** The part of storage that tells whether an account may hold a session. */
export type AccountActivityStore = {
  getUserAccount(userId: number): Promise<{ isActive: boolean } | undefined>;
};

/** A valid token whose account is deactivated, missing, or not named by the token. */
export class InactiveAccountError extends Error {
  constructor() {
    super('Account is not active');
    this.name = 'InactiveAccountError';
  }
}

/** The account could not be read, so no session can be confirmed. */
export class AccountLookupError extends Error {
  constructor(cause: unknown) {
    super('Account lookup failed');
    this.name = 'AccountLookupError';
    (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Verifies `token` as an access token of an account that is active now, and returns its payload.
 * The flag is read from storage on every call, so deactivating an account ends its sessions at
 * once. Throws InactiveAccountError (the account is deactivated or missing, or the token names no
 * account), AccountLookupError (the account could not be read) or the verification error of
 * verifyAccessToken; nothing is accepted on a failure.
 */
export async function verifyActiveAccessToken(
  token: string,
  store: AccountActivityStore
): Promise<any> {
  const payload = verifyAccessToken(token);
  const accountId = Number(payload.id);
  if (!Number.isInteger(accountId) || accountId <= 0) throw new InactiveAccountError();
  let account: { isActive: boolean } | undefined;
  try {
    account = await store.getUserAccount(accountId);
  } catch (error) {
    throw new AccountLookupError(error);
  }
  if (account?.isActive !== true) throw new InactiveAccountError();
  return payload;
}
