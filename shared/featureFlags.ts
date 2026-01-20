export type PapyrMode = 'personal' | 'team';

export interface FeatureFlags {
  PAPYR_MODE: PapyrMode;
  FEATURE_TEAMS: boolean;
  FEATURE_ADMIN: boolean;
  FEATURE_CALENDAR: boolean;
  FEATURE_TEMPLATES: boolean;
  FEATURE_AUTOMATION: boolean;
  FEATURE_NOTIFICATIONS: boolean;
  FEATURE_AI_SEARCH: boolean;
  FEATURE_COLLABORATION: boolean;
}

function parseMode(value: unknown): PapyrMode {
  if (typeof value !== 'string') return 'team';
  const v = value.trim().toLowerCase();
  if (v === 'personal') return 'personal';
  if (v === 'team') return 'team';
  return 'team';
}

function parseBooleanEnv(value: unknown): boolean | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return undefined;
}

export function resolveFeatureFlags(env: Record<string, string | undefined>): FeatureFlags {
  const mode = parseMode(env.PAPYR_MODE);

  const defaultsForMode: Omit<FeatureFlags, 'PAPYR_MODE'> =
    mode === 'personal'
      ? {
          FEATURE_TEAMS: false,
          FEATURE_ADMIN: false,
          FEATURE_CALENDAR: false,
          FEATURE_TEMPLATES: false,
          FEATURE_AUTOMATION: false,
          FEATURE_NOTIFICATIONS: false,
          FEATURE_AI_SEARCH: false,
          FEATURE_COLLABORATION: false,
        }
      : {
          FEATURE_TEAMS: true,
          FEATURE_ADMIN: true,
          FEATURE_CALENDAR: true,
          FEATURE_TEMPLATES: true,
          FEATURE_AUTOMATION: true,
          FEATURE_NOTIFICATIONS: true,
          FEATURE_AI_SEARCH: true,
          FEATURE_COLLABORATION: true,
        };

  const resolve = <K extends keyof Omit<FeatureFlags, 'PAPYR_MODE'>>(key: K): boolean => {
    const explicit = parseBooleanEnv(env[key]);
    return explicit ?? defaultsForMode[key];
  };

  return {
    PAPYR_MODE: mode,
    FEATURE_TEAMS: resolve('FEATURE_TEAMS'),
    FEATURE_ADMIN: resolve('FEATURE_ADMIN'),
    FEATURE_CALENDAR: resolve('FEATURE_CALENDAR'),
    FEATURE_TEMPLATES: resolve('FEATURE_TEMPLATES'),
    FEATURE_AUTOMATION: resolve('FEATURE_AUTOMATION'),
    FEATURE_NOTIFICATIONS: resolve('FEATURE_NOTIFICATIONS'),
    FEATURE_AI_SEARCH: resolve('FEATURE_AI_SEARCH'),
    FEATURE_COLLABORATION: resolve('FEATURE_COLLABORATION'),
  };
}
