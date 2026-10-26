import { describe, it, expect } from 'vitest';
import {
  createSlug,
  extractHeadings,
  estimateReadingTime,
} from '../../../client/src/lib/markdown.ts';

describe('smoke: markdown utils', () => {
  it('createSlug normalizes title to kebab-case', () => {
    expect(createSlug('Hello World!  test')).toBe('hello-world-test');
    // Current implementation keeps possible leading/trailing hyphens when trimming spaces
    expect(createSlug('  Multiple   Spaces___and symbols!!! ')).toBe(
      '-multiple-spaces___and-symbols-'
    );
  });

  it('extractHeadings finds headings with correct levels and ids', () => {
    const md = `# Title One\n\nSome text\n\n## Subtitle Two\n### Third`;
    const headings = extractHeadings(md);
    // Ids are prefixed (#113 §1) so heading ids from page text never collide with app ids.
    expect(headings.map((h) => ({ level: h.level, id: h.id, text: h.text }))).toEqual([
      { level: 1, id: 'heading-title-one', text: 'Title One' },
      { level: 2, id: 'heading-subtitle-two', text: 'Subtitle Two' },
      { level: 3, id: 'heading-third', text: 'Third' },
    ]);
  });

  it('estimateReadingTime approximates by word count', () => {
    const words = Array.from({ length: 401 }, () => 'word').join(' ');
    // 401 words at 200 wpm ≈ ceil(401/200) = 3 minutes
    expect(estimateReadingTime(words)).toBe(3);
  });
});
