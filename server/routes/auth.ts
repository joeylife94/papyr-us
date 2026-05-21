import type { Express } from 'express';
import { authMiddleware, buildRateLimiter, type AuthRequest } from '../middleware.js';
import { config } from '../config.js';
import { users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { DBStorage } from '../storage.js';
import logger from '../services/logger.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';

const rlAuth = buildRateLimiter({ windowMs: 60_000, max: 20 });

export function registerAuthRoutes(app: Express, storage: DBStorage): void {
  // User Registration
  app.post('/api/auth/register', rlAuth, async (req, res) => {
    try {
      if (process.env.E2E_DEBUG_AUTH === '1') {
        logger.debug('[E2E DEBUG] /api/auth/register body', {
          name: req.body?.name,
          email: req.body?.email,
        });
      }
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required' });
      }

      // Validate name length
      if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
        return res.status(400).json({ message: 'Name must be between 1 and 100 characters' });
      }

      // Validate email format and length
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof email !== 'string' || email.length > 255 || !emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }

      // Validate password strength (min 8 chars, at least one letter and one number)
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({ message: 'Password must be between 8 and 128 characters' });
      }
      if (
        !/[a-zA-Z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[!@#$%^&*(),.?":{}|<>]/.test(password)
      ) {
        return res.status(400).json({
          message:
            'Password must contain at least one letter, one number, and one special character',
        });
      }

      const existingUser = await storage.db.select().from(users).where(eq(users.email, email));
      if (existingUser.length > 0) {
        return res.status(409).json({ message: 'User with this email already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const newUserResult = await storage.db
        .insert(users)
        .values({ name, email, hashedPassword, provider: 'local' })
        .returning();
      const newUser = newUserResult[0];
      if (process.env.E2E_DEBUG_AUTH === '1') {
        logger.debug('[E2E DEBUG] /api/auth/register response user', {
          id: newUser.id,
          email: newUser.email,
        });
      }

      // Issue access token (1 hour) and refresh token (30 days)
      const role = config.adminEmails.includes(email.toLowerCase()) ? 'admin' : 'user';
      const accessToken = jwt.sign(
        { id: newUser.id, email: newUser.email, role },
        config.jwtSecret,
        {
          expiresIn: '1h',
        }
      );
      const refreshToken = jwt.sign({ id: newUser.id, type: 'refresh' }, config.jwtSecret, {
        expiresIn: '30d',
      });

      res
        .cookie('accessToken', accessToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 60 * 60 * 1000,
        })
        .cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
        .status(201)
        .json({
          message: 'User registered successfully',
          user: { id: newUser.id, name: newUser.name, email: newUser.email, role },
        });
    } catch (error: any) {
      logger.error('Registration critical error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        code: error.code,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Handle unique constraint violation for PostgreSQL (code 23505)
      if (error.code === '23505') {
        return res.status(409).json({ message: 'User with this email already exists' });
      }
      res.status(500).json({ message: 'Server error during registration' });
    }
  });

  // User Login
  app.post('/api/auth/login', rlAuth, async (req, res) => {
    try {
      if (process.env.E2E_DEBUG_AUTH === '1') {
        logger.debug('[E2E DEBUG] POST /api/auth/login body', { email: req.body?.email });
      }
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const userResult = await storage.db.select().from(users).where(eq(users.email, email));
      if (userResult.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const user = userResult[0];
      if (!user.hashedPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const role = config.adminEmails.includes((user.email || '').toLowerCase())
          ? 'admin'
          : 'user';

      // Issue access token (1 hour) and refresh token (30 days)
      const accessToken = jwt.sign({ id: user.id, email: user.email, role }, config.jwtSecret, {
        expiresIn: '1h',
      });
      const refreshToken = jwt.sign({ id: user.id, type: 'refresh' }, config.jwtSecret, {
        expiresIn: '30d',
      });

      if (process.env.E2E_DEBUG_AUTH === '1' || process.env.NODE_ENV !== 'production') {
        logger.debug('[E2E DEBUG] login success:', {
          id: user.id,
          email: user.email,
          role,
          accessTokenPresent: !!accessToken,
          refreshTokenPresent: !!refreshToken,
        });
      }

      res
        .cookie('accessToken', accessToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 60 * 60 * 1000,
        })
        .cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
        .json({
          user: { id: user.id, name: user.name, email: user.email, role },
        });
    } catch (error) {
      res.status(500).json({ message: 'Server error during login' });
    }
  });

  // Refresh access token using refresh token (reads from httpOnly cookie)
  app.post('/api/auth/refresh', rlAuth, async (req, res) => {
    try {
      // Cookie-based refresh token only — no body fallback
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ message: 'Refresh token required' });
      }

      // Verify refresh token
      const payload = jwt.verify(refreshToken, config.jwtSecret) as { id: number; type: string };

      if (payload.type !== 'refresh') {
        return res.status(401).json({ message: 'Invalid refresh token' });
      }

      // Get user info
      const userResult = await storage.db.select().from(users).where(eq(users.id, payload.id));

      if (userResult.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = userResult[0];
      const role = config.adminEmails.includes(user.email.toLowerCase()) ? 'admin' : 'user';

      // Issue new access token (7 days) and refresh token (30 days) - token rotation
      const newAccessToken = jwt.sign({ id: user.id, email: user.email, role }, config.jwtSecret, {
        expiresIn: '1h',
      });
      const newRefreshToken = jwt.sign({ id: user.id, type: 'refresh' }, config.jwtSecret, {
        expiresIn: '30d',
      });

      res
        .cookie('accessToken', newAccessToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 60 * 60 * 1000,
        })
        .cookie('refreshToken', newRefreshToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
        .json({
          user: { id: user.id, name: user.name, email: user.email, role },
        });
    } catch (error) {
      logger.error('Token refresh failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
  });

  // Get current user info (Protected Route)
  app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (process.env.E2E_DEBUG_AUTH === '1') {
        logger.debug('[E2E DEBUG] GET /api/auth/me', {
          hasAuthHeader: !!req.headers.authorization,
          userId: req.user?.id,
        });
      }
      const userResult = await storage.db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, req.user!.id));
      if (userResult.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      // Backward-compat: return only base user info here; role is available from JWT if needed
      res.json(userResult[0]);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Logout — clear auth cookies
  app.post('/api/auth/logout', (req, res) => {
    res
      .clearCookie('accessToken', {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
      })
      .clearCookie('refreshToken', {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
      })
      .json({ message: 'Logged out successfully' });
  });

  // Passport automatically handles OAuth2 state/nonce validation. SameSite=Lax is required for cross-site top-level redirects.
  // --- Social Auth Routes ---

  // Google Auth
  if (config.googleClientId && config.googleClientSecret) {
    app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
    app.get(
      '/api/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/login', session: false }),
      (req: AuthRequest, res) => {
        const role = config.adminEmails.includes((req.user!.email || '').toLowerCase()) ? 'admin' : 'user';
        const accessToken = jwt.sign(
          { id: req.user!.id, email: req.user!.email, role },
          config.jwtSecret,
          {
            expiresIn: '1h',
          }
        );
        const refreshToken = jwt.sign({ id: req.user!.id, type: 'refresh' }, config.jwtSecret, {
          expiresIn: '30d',
        });
        res
          .cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // Lax required: callback arrives via cross-site IdP redirect
            maxAge: 60 * 60 * 1000,
          })
          .cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // Lax required: callback arrives via cross-site IdP redirect
            maxAge: 30 * 24 * 60 * 60 * 1000,
          })
          .redirect('/');
      }
    );
  }

  // GitHub Auth
  if (config.githubClientId && config.githubClientSecret) {
    app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
    app.get(
      '/api/auth/github/callback',
      passport.authenticate('github', { failureRedirect: '/login', session: false }),
      (req: AuthRequest, res) => {
        const role = config.adminEmails.includes((req.user!.email || '').toLowerCase()) ? 'admin' : 'user';
        const accessToken = jwt.sign(
          { id: req.user!.id, email: req.user!.email, role },
          config.jwtSecret,
          {
            expiresIn: '1h',
          }
        );
        const refreshToken = jwt.sign({ id: req.user!.id, type: 'refresh' }, config.jwtSecret, {
          expiresIn: '30d',
        });
        res
          .cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // Lax required: callback arrives via cross-site IdP redirect
            maxAge: 60 * 60 * 1000,
          })
          .cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // Lax required: callback arrives via cross-site IdP redirect
            maxAge: 30 * 24 * 60 * 60 * 1000,
          })
          .redirect('/');
      }
    );
  }

  // Update user profile
  app.put('/api/auth/profile', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
        return res.status(400).json({ error: 'Name must be between 1 and 100 characters' });
      }

      const { eq } = await import('drizzle-orm');
      const db = storage.db;

      const [updated] = await db
        .update(users)
        .set({ name: name.trim(), updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id, name: users.name, email: users.email });

      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(updated);
    } catch (error) {
      logger.error('Error updating profile:', { error });
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Change password
  app.post('/api/auth/change-password', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }

      // Validate new password strength
      if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({ error: 'New password must be between 8 and 128 characters' });
      }
      if (
        !/[a-zA-Z]/.test(newPassword) ||
        !/[0-9]/.test(newPassword) ||
        !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
      ) {
        return res.status(400).json({
          error:
            'New password must contain at least one letter, one number, and one special character',
        });
      }

      const { eq } = await import('drizzle-orm');
      const db = storage.db;

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.hashedPassword) {
        return res.status(400).json({ error: 'Password change not available for OAuth accounts' });
      }

      const isValid = await bcrypt.compare(currentPassword, user.hashedPassword);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await db
        .update(users)
        .set({ hashedPassword, updatedAt: new Date() })
        .where(eq(users.id, userId));

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Error changing password:', { error });
      res.status(500).json({ error: 'Failed to change password' });
    }
  });
}
