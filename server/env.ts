import { config } from "./config";

export interface ValidateOptions {
  exitOnError?: boolean;
}

export function validateEnv(options: ValidateOptions = {}): boolean {
  const envFlag = (process.env.FAIL_ON_MISSING_ENV || '').toLowerCase();
  const exitOnError = options.exitOnError ?? (process.env.NODE_ENV === 'production' || envFlag === 'true');
  const missing: string[] = [];

  // Required secrets
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');

  // DB requirement when useDatabase is true
  try {
    if (config.useDatabase && !process.env.DATABASE_URL) {
      missing.push('DATABASE_URL');
    }
  } catch (err) {
    // If config.throwing, assume DATABASE_URL required only if env flag set
    if ((process.env.USE_DATABASE || '').toLowerCase() === 'true' && !process.env.DATABASE_URL) {
      missing.push('DATABASE_URL');
    }
  }

  if (missing.length > 0) {
    console.error('[ENV] Missing required environment variables: %s', missing.join(', '));
    if (exitOnError) {
      console.error('[ENV] Exiting due to missing required environment variables.');
      process.exit(1);
    }
    return false;
  }

  // Warnings
  if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY_ENV_VAR) {
    console.warn('[ENV] OPENAI_API_KEY not set - AI features will be disabled.');
  }

  return true;
}

export default validateEnv;
