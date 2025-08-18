import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { storage } from '../storage';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.db.select().from(users).where(eq(users.id, id));
    done(null, user[0]);
  } catch (error) {
    done(error, null);
  }
});

/*
passport.use(new GoogleStrategy({
    clientID: config.googleClientId,
    clientSecret: config.googleClientSecret,
    callbackURL: '/api/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('No email found from Google'), undefined);
      }

      let user = await storage.db.select().from(users).where(eq(users.email, email));

      if (user.length > 0) {
        return done(null, user[0]);
      } else {
        const newUser = await storage.db.insert(users).values({
          name: profile.displayName,
          email: email,
          provider: 'google',
          providerId: profile.id,
        }).returning();
        return done(null, newUser[0]);
      }
    } catch (error) {
      return done(error, undefined);
    }
  }
));

passport.use(new GitHubStrategy({
    clientID: config.githubClientId,
    clientSecret: config.githubClientSecret,
    callbackURL: '/api/auth/github/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('No email found from GitHub'), undefined);
      }

      let user = await storage.db.select().from(users).where(eq(users.email, email));

      if (user.length > 0) {
        return done(null, user[0]);
      } else {
        const newUser = await storage.db.insert(users).values({
          name: profile.displayName || profile.username,
          email: email,
          provider: 'github',
          providerId: profile.id,
        }).returning();
        return done(null, newUser[0]);
      }
    } catch (error) {
      return done(error, undefined);
    }
  }
));
*/
