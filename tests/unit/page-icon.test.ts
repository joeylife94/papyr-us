import { describe, expect, it } from 'vitest';
import { isSingleEmoji, pageIconSchema } from '../../shared/schema';

describe('isSingleEmoji', () => {
  it('accepts one emoji, including skin tones, ZWJ sequences, flags and keycaps', () => {
    for (const icon of ['🚀', '📄', '✅', '❤️', '👍🏽', '👨‍👩‍👧', '🇰🇷', '#️⃣']) {
      expect(isSingleEmoji(icon), icon).toBe(true);
    }
  });

  it('rejects text, several emoji, padding and empty values', () => {
    for (const value of ['', 'a', 'ab', '1', '🚀🚀', ' 🚀', '🚀 ', 'x🚀', '<b>', '제목']) {
      expect(isSingleEmoji(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('pageIconSchema', () => {
  it('parses an emoji and reports a Korean message otherwise', () => {
    expect(pageIconSchema.parse('📚')).toBe('📚');
    const result = pageIconSchema.safeParse('not an emoji');
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe('아이콘은 이모지 하나여야 합니다');
  });

  it('allows null only where the caller adds it', () => {
    expect(pageIconSchema.nullable().parse(null)).toBeNull();
    expect(pageIconSchema.safeParse(null).success).toBe(false);
  });
});
