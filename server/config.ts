export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '5001'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database configuration
  databaseUrl: process.env.DATABASE_URL,

  // JWT Secret
  jwtSecret: process.env.JWT_SECRET || 'your-default-secret',

  // OAuth Configuration
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',

  // Admin configuration
  adminPassword: process.env.ADMIN_PASSWORD || '404vibe!',
  // Comma-separated list of admin emails for RBAC
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // AI configuration
  openaiApiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR,

  // RBAC/Authorization toggles
  get enforceAuthForWrites() {
    const v = (process.env.ENFORCE_AUTH_WRITES || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  },

  // Environment checks
  get isProduction() {
    return this.nodeEnv === 'production';
  },

  get isDevelopment() {
    return this.nodeEnv === 'development';
  },

  get isReplit() {
    return process.env.REPL_ID !== undefined;
  },

  // Server host determination
  get host() {
    return this.isProduction || this.isReplit ? '0.0.0.0' : 'localhost';
  },
};
