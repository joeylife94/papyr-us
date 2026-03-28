import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import logger from './logger.js';
import type { Pool } from 'pg';

// The passport strategies need access to the database.
// Instead of importing storage directly (circular dependency), we accept a db
// instance at setup time via `initPassportStrategies`.
let _db: any = null;

export function initPassportStrategies(db: any) {
  _db = db;

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
        },
        async (
          accessToken: string,
          refreshToken: string,
          profile: any,
          done: (err: any, user?: any) => void
        ) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email found from Google'), undefined);
            }

            const existing = await _db.select().from(users).where(eq(users.email, email));

            if (existing.length > 0) {
              return done(null, existing[0]);
            } else {
              const newUser = await _db
                .insert(users)
                .values({
                  name: profile.displayName || email.split('@')[0],
                  email,
                  provider: 'google',
                  providerId: profile.id,
                })
                .returning();
              return done(null, newUser[0]);
            }
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
        },
        async (
          accessToken: string,
          refreshToken: string,
          profile: any,
          done: (err: any, user?: any) => void
        ) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email found from GitHub'), undefined);
            }

            const existing = await _db.select().from(users).where(eq(users.email, email));

            if (existing.length > 0) {
              return done(null, existing[0]);
            } else {
              const newUser = await _db
                .insert(users)
                .values({
                  name: profile.displayName || profile.username || email.split('@')[0],
                  email,
                  provider: 'github',
                  providerId: profile.id,
                })
                .returning();
              return done(null, newUser[0]);
            }
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
