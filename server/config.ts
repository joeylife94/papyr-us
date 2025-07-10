export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '5001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  databaseUrl: process.env.DATABASE_URL,
  
  // Admin configuration
  adminPassword: process.env.ADMIN_PASSWORD || '404vibe!',
  
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