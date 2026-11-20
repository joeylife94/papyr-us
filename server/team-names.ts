import { randomInt } from 'node:crypto';

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX_LENGTH = 5;
const MAX_BASE_LENGTH = 30;

/**
 * A URL name for a team (`/teams/:teamName/...`): the base lowercased to letters and digits
 * joined by hyphens, then a random suffix. The name always starts with a letter (`team-` is put
 * in front of a base that starts with a digit, and stands alone when nothing usable is left, as
 * for a Korean name), because a team-scoped route reads a value that starts with a number as a
 * number, not as a name (parseTeamReference in middleware.ts). Team names are unique across the
 * instance, so the server makes them from the display name.
 * `random` is injectable for tests (an integer in [0, max)).
 */
export function generateTeamUrlName(
  base: string,
  random: (max: number) => number = (max) => randomInt(max)
): string {
  const slug = base
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/g, '');
  const readable = slug === '' ? 'team' : /^[a-z]/.test(slug) ? slug : `team-${slug}`;
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1)
    suffix += SUFFIX_ALPHABET[random(SUFFIX_ALPHABET.length)];
  return `${readable}-${suffix}`;
}
