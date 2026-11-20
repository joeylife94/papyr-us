import { randomInt } from 'node:crypto';

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX_LENGTH = 5;
const MAX_BASE_LENGTH = 30;

/**
 * A URL name for a team (`/teams/:teamName/...`): the base lowercased to letters and digits
 * joined by hyphens (`team` when nothing usable is left, as for a Korean name), then a random
 * suffix. Team names are unique across the instance, so the server makes them: a name is never
 * taken from the caller as it stands, and the caller never learns that a name is already held.
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
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1)
    suffix += SUFFIX_ALPHABET[random(SUFFIX_ALPHABET.length)];
  return `${slug || 'team'}-${suffix}`;
}
