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
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    // default: enabled in production, disabled otherwise
    return this.isProduction;
  },
  get allowAdminPassword() {
    const v = (process.env.ALLOW_ADMIN_PASSWORD || '').toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    // default: disallow in production, allow in non-production for dev convenience
    return !this.isProduction;
  },

  // Rate limiting (basic, in-memory)
  get rateLimitEnabled() {
    const v = (process.env.RATE_LIMIT_ENABLED || '').toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    // default: enabled in production, disabled otherwise
    return this.isProduction;
  },
  get rateLimitWindowMs() {
    const n = Number(process.env.RATE_LIMIT_WINDOW_MS || '60000');
    return Number.isFinite(n) && n > 0 ? n : 60000; // 1 minute
  },
  get rateLimitMax() {
    const n = Number(process.env.RATE_LIMIT_MAX || '60');
    return Number.isFinite(n) && n > 0 ? n : 60; // 60 reqs per window
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
    // Allow explicit override for tricky environments (IPv6/localhost resolution issues)
    // but only when ALLOW_HOST_OVERRIDE is explicitly enabled to avoid surprising defaults in tests
    const explicit = process.env.HOST?.trim();
    const allowOverride = (() => {
      const v = (process.env.ALLOW_HOST_OVERRIDE || '').toLowerCase();
      return v === '1' || v === 'true' || v === 'yes';
    })();

    if (allowOverride && explicit) return explicit;
    return this.isProduction || this.isReplit ? '0.0.0.0' : 'localhost';
  },

  // CORS & Security
  get corsAllowedOrigins() {
    // Comma-separated list of allowed origins; empty means allow same-origin only
    const raw = process.env.CORS_ALLOWED_ORIGINS || '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get corsAllowCredentials() {
    const v = (process.env.CORS_ALLOW_CREDENTIALS || '').toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    // default safe: false
    return false;
  },
  get adminIpWhitelist() {
    const raw = process.env.ADMIN_IP_WHITELIST || '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
};
