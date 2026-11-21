/**
 * The `state` of the Google and GitHub sign-in flows.
 *
 * Every sign-in start makes a random state, puts it in a short-lived httpOnly SameSite=Lax cookie
 * (`__Host-` and path `/` on HTTPS, as the invitation cookie) and passes the same value to the
 * provider. The callback proceeds only when the state the provider returns equals the cookie's;
 * a missing or different state refuses the sign-in. No server-side session store is involved.
 *
 * It is the `store` of passport-oauth2's strategy options.
 */
import { randomBytes, timingSafeEqual } from 'crypto';
import type { StateStore } from 'passport-oauth2';
import { config } from './config.js';

/** How long a sign-in may take between its start and its callback. */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
/** Bytes of randomness in a state (256 bits). */
export const OAUTH_STATE_BYTES = 32;
/** The `info.code` a refused callback reports; the login page shows the reason for it. */
export const OAUTH_STATE_REFUSAL = 'oauth_state';

export function oauthStateCookie(secure: boolean): { name: string; path: string } {
  return secure
    ? { name: '__Host-oauth_state', path: '/' }
    : { name: 'oauth_state', path: '/api/auth' };
}

/** Attributes shared by setting and clearing the cookie. */
export function oauthStateCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: oauthStateCookie(config.isProduction).path,
  };
}

function sameState(expected: unknown, provided: unknown): boolean {
  if (typeof expected !== 'string' || typeof provided !== 'string' || expected === '') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// passport-oauth2 picks the call shape from the functions' arity: store(req, callback) and
// verify(req, state, callback).
export const oauthStateStore = {
  /** Makes the state, sets the cookie on the response that redirects to the provider. */
  store(req: any, callback: (err: Error | null, state: any) => void) {
    const res = req?.res;
    if (!res || typeof res.cookie !== 'function') {
      return callback(new Error('OAuth state cannot be stored without a response'), undefined);
    }
    const state = randomBytes(OAUTH_STATE_BYTES).toString('base64url');
    res.cookie(oauthStateCookie(config.isProduction).name, state, {
      ...oauthStateCookieOptions(),
      maxAge: OAUTH_STATE_MAX_AGE_MS,
    });
    return callback(null, state);
  },

  /** True only when the returned state equals the one this browser was given. */
  verify(
    req: any,
    providedState: unknown,
    callback: (err: Error | null, ok: boolean, info: any) => void
  ) {
    const expected = req?.cookies?.[oauthStateCookie(config.isProduction).name];
    if (!sameState(expected, providedState)) {
      return callback(null, false, { code: OAUTH_STATE_REFUSAL });
    }
    return callback(null, true, undefined);
  },
} as unknown as StateStore;
