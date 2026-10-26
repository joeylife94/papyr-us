/**
 * Page icons (#103 E4): `wiki_pages.icon` holds exactly one emoji, or null for none. The icon
 * picker and every server write path that can set the icon use this one check.
 */
import { z } from 'zod';

/** Longest stored icon, in UTF-16 code units. The longest standard emoji sequences use 15. */
export const PAGE_ICON_MAX_LENGTH = 32;

// One emoji element: a pictographic base in emoji presentation (by default, through VS16, or
// through a skin-tone modifier).
const BASE =
  '(?:\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}' +
  '|(?=\\p{Extended_Pictographic})\\p{Emoji_Presentation}\\uFE0F?' +
  '|\\p{Extended_Pictographic}\\uFE0F)';
// Parts joined by ZWJ (👩‍💻, 🏳️‍🌈, 🧑🏽‍🤝‍🧑🏿); their VS16 is often left out.
const ZWJ_PART = '\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?';
const SEQUENCE = `${BASE}(?:\\u200D${ZWJ_PART})*`;
const KEYCAP = '[0-9#*]\\uFE0F?\\u20E3';
const FLAG = '\\p{Regional_Indicator}{2}';
// Subdivision flags (🏴󠁧󠁢󠁳󠁣󠁴󠁿): a black flag, tag letters and a cancel tag.
const TAG_FLAG = '\\u{1F3F4}[\\u{E0020}-\\u{E007E}]+\\u{E007F}';

const SINGLE_EMOJI = new RegExp(`^(?:${KEYCAP}|${FLAG}|${TAG_FLAG}|${SEQUENCE})$`, 'u');

/**
 * Whether `value` is a storable page icon: exactly one emoji (ZWJ sequences, skin tones, VS16,
 * flags and keycaps included). Text, whitespace, markup and several emojis are rejected. A
 * cleared icon is `null`, which callers accept separately.
 */
export function isValidPageIcon(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PAGE_ICON_MAX_LENGTH &&
    SINGLE_EMOJI.test(value)
  );
}

export const PAGE_ICON_ERROR = 'Icon must be a single emoji';

/**
 * The `icon` field of page writes (POST /api/pages, PUT /api/pages/:id and its autosave): one
 * emoji, or null to clear it. Applied by the routes, which keeps `shared/schema.ts` free of local
 * imports (drizzle-kit loads that file through CommonJS `require`).
 */
export const pageIconField = z
  .string()
  .refine(isValidPageIcon, { message: PAGE_ICON_ERROR })
  .nullable()
  .optional();
