// Relative import: unit tests load this module without the Vite aliases.
import { MAX_EMBEDS_PER_PAGE } from '../../../shared/page-embeds';

/**
 * How many embeds one page view may still render (#135). Every embed on the page, nested ones
 * included, claims a place when it mounts and gives it back when it unmounts; once `limit` places
 * are taken, further embeds show a link instead of the page. Embeds mount in document order and
 * nested embeds only after their parent's content has loaded, so the viewed page's own embeds
 * come first.
 */
export interface EmbedBudget {
  /** Whether the embed `key` may render; asking again with the same key gives the same place. */
  claim(key: string): boolean;
  release(key: string): void;
}

export function createEmbedBudget(limit = MAX_EMBEDS_PER_PAGE): EmbedBudget {
  const granted = new Set<string>();
  return {
    claim(key) {
      if (granted.has(key)) return true;
      if (granted.size >= limit) return false;
      granted.add(key);
      return true;
    },
    release(key) {
      granted.delete(key);
    },
  };
}
