const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The URL name of a new team (`/teams/:teamName/...`), made from its display name: lowercase
 * letters and digits joined by hyphens, then a short random suffix. Team names are unique across
 * the instance and are not chosen by hand in the sidebar, so a clash with another team's name
 * (which could belong to an organization the creator cannot see) is practically never met.
 * `random` is injectable for tests.
 */
export function teamUrlName(displayName: string, random: () => number = Math.random): string {
  const base = displayName
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    suffix +=
      SUFFIX_ALPHABET[Math.floor(random() * SUFFIX_ALPHABET.length) % SUFFIX_ALPHABET.length];
  }
  return `${base || 'team'}-${suffix}`;
}
