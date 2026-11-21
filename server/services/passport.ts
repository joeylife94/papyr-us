import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { users } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { createUserInDefaultOrganization } from '../organizations.js';
import {
  invitationIntentCookie,
  decideSignup,
  isPlausibleInvitationToken,
} from '../organization-invitations.js';
import { oauthStateStore } from '../oauth-state.js';
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
  | 'invitation_email_mismatch'
  | 'email_taken'
  | 'email_unverified'
  | 'organization_busy';

function isVerified(entry: any): boolean {
  return entry?.verified === true || entry?.verified === 'true';
}

/**
 * The address entry a profile signs in with. GitHub (allRawEmails) returns every address of the
 * account with its verification: the public profile address when GitHub reports one (what the
 * account was matched on before addresses were read from the list), else the primary address;
 * either counts only when the list marks that exact address verified. There is no fallback to an
 * unverified address or to the first entry: null means there is no verified address to use.
 * Google returns the one address it vouches for.
 */
function addressEntryOf(provider: 'google' | 'github', profile: any): any {
  const entries: any[] = Array.isArray(profile.emails) ? profile.emails : [];
  if (provider === 'github') {
    const verified = entries.filter((e) => isVerified(e) && typeof e?.value === 'string');
    const publicAddress = profile._json?.email;
    if (typeof publicAddress === 'string' && publicAddress !== '') {
      const entry = verified.find((e) => e.value === publicAddress);
      if (entry) return entry;
    }
    return verified.find((e) => e.primary === true) ?? null;
  }
  return entries[0];
}

/**
 * Signs a social profile in, creating the account when it is new. The sign-up policy
 * (SIGNUP_MODE, issue #124 X1d) decides a new account; an account that already exists signs in
 * as before. An invitation token travels in an httpOnly cookie (set before the redirect, scoped
 * to /api/auth) and is used here only for a new account (the person's own sign-up from the join
 * page): it decides the organization and the role. An existing account never joins inside the
 * callback: the token is left on `req.invitationCarry` and the callback sends the person to the
 * join page, where they see the organization and press the button.
 */
async function signInSocialProfile(
  req: any,
  provider: 'google' | 'github',
  profile: any,
  done: (err: any, user?: any, info?: any) => void
) {
  const emailEntry = addressEntryOf(provider, profile);
  const email = emailEntry?.value;
  if (!email && provider === 'github') {
    // No verified address to sign in with.
    return done(null, false, { code: 'email_unverified' satisfies SocialSignInRefusal });
  }
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
  const rawToken = req?.cookies?.[invitationIntentCookie(config.isProduction).name];
  const hasToken = rawToken !== undefined && rawToken !== null && rawToken !== '';

  // An address is taken when an account has it ignoring case. The account with exactly this
  // address signs in as before; one that differs only in case is not signed in to and no second
  // account is made.
  const sameAddress: any[] = await _db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  const existing = sameAddress.filter((u) => u.email === email);
  if (existing.length > 0) {
    if (hasToken && existing[0].isActive !== false && isPlausibleInvitationToken(rawToken)) {
      req.invitationCarry = rawToken;
    }
    return done(null, existing[0]);
  }
  if (sameAddress.length > 0) {
    return done(null, false, { code: 'email_taken' satisfies SocialSignInRefusal });
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

/** A busy organization is "try again", not a server error; anything else goes to the error handler. */
function failSocialSignIn(error: any, done: (err: any, user?: any, info?: any) => void) {
  if (error?.name === 'EmailTakenError') {
    return done(null, false, { code: 'email_taken' satisfies SocialSignInRefusal });
  }
  if (error?.name === 'OrganizationBusyError') {
    return done(null, false, { code: 'organization_busy' satisfies SocialSignInRefusal });
  }
  return done(error, undefined);
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
          // A random state in a short-lived cookie, checked at the callback
          store: oauthStateStore,
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
            return failSocialSignIn(error, done);
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
          store: oauthStateStore,
          // All of the account's addresses, with their verification: the strategy only asks
          // GitHub for them when the scope names them.
          scope: ['user:email'],
          allRawEmails: true,
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
            return failSocialSignIn(error, done);
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
