/// <reference types="vite/client" />

// Optional: if you ever want to drive flags directly from Vite at build time,
// you can add VITE_* variants of the feature flags.
interface ImportMetaEnv {
  readonly VITE_PAPYR_MODE?: 'personal' | 'team';
  readonly VITE_FEATURE_TEAMS?: string;
  readonly VITE_FEATURE_ADMIN?: string;
  readonly VITE_FEATURE_CALENDAR?: string;
  readonly VITE_FEATURE_TEMPLATES?: string;
  readonly VITE_FEATURE_AUTOMATION?: string;
  readonly VITE_FEATURE_NOTIFICATIONS?: string;
  readonly VITE_FEATURE_AI_SEARCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
