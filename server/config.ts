export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '5001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  databaseUrl: process.env.DATABASE_URL,
  
  // Use database backend flag. Accepts 'true'|'false' (case-insensitive) via USE_DATABASE.
  // If not set, we infer from presence of DATABASE_URL.
  get useDatabase() {
    const env = (process.env.USE_DATABASE || '').toLowerCase();
    if (env === 'true') return true;
    if (env === 'false') return false;
    return !!this.databaseUrl;
  },

  // JWT Secret - must be provided via environment in production
  jwtSecret: process.env.JWT_SECRET,

  // OAuth Configuration
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  
  // Admin configuration
  adminPassword: process.env.ADMIN_PASSWORD,
  
  // AI configuration
  openaiApiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR,
  
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
    return (this.isProduction || this.isReplit) ? '0.0.0.0' : 'localhost';
  }
}; 