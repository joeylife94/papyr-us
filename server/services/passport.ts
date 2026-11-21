import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { createUserInDefaultOrganization } from '../organizations.js';
import {
  INVITATION_INTENT_COOKIE,
  decideSignup,
  isPlausibleInvitationToken,
} from '../organization-invitations.js';
import logger from './logger.js';

// The passport strategies need access to the database.
// Instead of importing storage directly (circular dependency), we accept a db
// instance (and the storage, for invitations) at setup time via `initPassportStrategies`.
let _db: any = null;
let _storage: any = null;

/** Why a social sign-in was turned away, as `info` of the failed authentication. */
export type SocialSignInRefusal =
  | 'signup_closed'
  | 'signup_requires_invitation'
  | 'invitation_invalid'
  | 'invitation_email_mismatch';

/** What the invitation carried through the round trip did for an account that already existed. */
export type SocialInvitationOutcome =
  | 'joined'
  | 'already_member'
  | 'invalid'
  | 'account_inactive'
  | 'email_mismatch'
  | 'other_organization';

function isVerified(entry: any): boolean {
  return entry?.verified === true || entry?.verified === 'true';
}

/**
 * Signs a social profile in, creating the account when it is new. The sign-up policy
 * (SIGNUP_MODE, issue #124 X1d) decides a new account; an account that already exists signs in
 * as before. An invitation token travels in an httpOnly cookie (set before the redirect, scoped
 * to /api/auth) and is used here: for a new account it decides the organization and the role,
 * for an existing one without an organization it is accepted. The outcome for an existing account
 * is left on `req.invitationOutcome` for the callback to report.
 */
async function signInSocialProfile(
  req: any,
  provider: 'google' | 'github',
  profile: any,
  done: (err: any, user?: any, info?: any) => void
) {
  const emailEntry = profile.emails?.[0];
  const email = emailEntry?.value;
  if (!email) {
    return done(
      new Error(`No email found from ${provider === 'google' ? 'Google' : 'GitHub'}`),
      undefined
    );
  }
  const name =
    provider === 'google'
      ? profile.displayName || email.split('@')[0]
      : profile.displayName || profile.username || email.split('@')[0];
  const rawToken = req?.cookies?.[INVITATION_INTENT_COOKIE];
  const hasToken = rawToken !== undefined && rawToken !== null && rawToken !== '';

  const existing = await _db.select().from(users).where(eq(users.email, email));
  if (existing.length > 0) {
    if (hasToken && existing[0].isActive !== false) {
      // An account without an organization may join through the invitation it was sent.
      const outcome = _storage
        ? await _storage.acceptOrganizationInvitation(rawToken, existing[0].id)
        : { kind: 'invalid' };
      req.invitationOutcome = outcome.kind as SocialInvitationOutcome;
    }
    return done(null, existing[0]);
  }

  const decision = decideSignup({
    mode: config.signupMode,
    hasInvitationToken: hasToken,
    // The first account of a new install: the address must be one the provider verified.
    isBootstrapAdmin: config.adminEmails.includes(email.toLowerCase()) && isVerified(emailEntry),
  });
  if (decision.kind === 'refused') return done(null, false, { code: decision.code });

  const values = { name, email, provider, providerId: profile.id };
  if (decision.kind === 'invitation') {
    if (!_storage || !isPlausibleInvitationToken(rawToken)) {
      return done(null, false, { code: 'invitation_invalid' satisfies SocialSignInRefusal });
    }
    const joined = await _storage.registerWithOrganizationInvitation(rawToken, values, {
      emailVerified: isVerified(emailEntry),
    });
    if (joined.kind === 'registered') return done(null, joined.user);
    if (joined.kind === 'email_mismatch') {
      return done(null, false, { code: 'invitation_email_mismatch' satisfies SocialSignInRefusal });
    }
    // Another sign-up took the address meanwhile: sign in again to continue as that account.
    if (joined.kind === 'email_taken') return done(null, false, { code: 'invitation_invalid' });
    return done(null, false, { code: 'invitation_invalid' satisfies SocialSignInRefusal });
  }

  const newUser = await createUserInDefaultOrganization(_db, values);
  return done(null, newUser);
}

export function initPassportStrategies(db: any, storage?: any) {
  _db = db;
  _storage = storage ?? null;

  // --- Serialize / Deserialize ---
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      if (!_db) return done(new Error('DB not initialized'), null);
      const result = await _db.select().from(users).where(eq(users.id, id));
      done(null, result[0] || null);
    } catch (error) {
      done(error, null);
    }
  });

  // --- Google Strategy ---
  if (config.googleClientId && config.googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.googleClientId,
          clientSecret: config.googleClientSecret,
          callbackURL: '/api/auth/google/callback',
          passReqToCallback: true,
        },
        async (
          req: any,
          accessToken: string,
          refreshToken: string,
          profile: any,
          done: (err: any, user?: any, info?: any) => void
        ) => {
          try {
            return await signInSocialProfile(req, 'google', profile, done);
          } catch (error) {
            return done(error, undefined);
          }
        }
      )
    );
    logger.info('[Passport] Google OAuth strategy registered');
  } else {
    logger.info(
      '[Passport] Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)'
    );
  }

  // --- GitHub Strategy ---
  if (config.githubClientId && config.githubClientSecret) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: config.githubClientId,
          clientSecret: config.githubClientSecret,
          callbackURL: '/api/auth/github/callback',
          passReqToCallback: true,
        },
        async (
          req: any,
          accessToken: string,
          refreshToken: string,
          profile: any,
          done: (err: any, user?: any, info?: any) => void
        ) => {
          try {
            return await signInSocialProfile(req, 'github', profile, done);
          } catch (error) {
            return done(error, undefined);
          }
        }
      )
    );
    logger.info('[Passport] GitHub OAuth strategy registered');
  } else {
    logger.info(
      '[Passport] GitHub OAuth not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)'
    );
  }
}

export default passport;
