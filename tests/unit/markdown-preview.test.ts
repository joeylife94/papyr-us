import { describe, expect, it } from 'vitest';
import { toPlainTextPreview } from '../../client/src/lib/markdown';

describe('document list preview text', () => {
  it('drops markdown syntax and collapses whitespace', () => {
    const content =
      'Guidelines for **small** teams.\n\n## Weekly rhythm\n\n- Review `tasks`\n- See [decisions](/page/x)\n> Quote';
    expect(toPlainTextPreview(content)).toBe(
      'Guidelines for small teams. Weekly rhythm Review tasks See decisions Quote'
    );
  });

  it('only adds an ellipsis when the text was shortened', () => {
    expect(toPlainTextPreview('Short note')).toBe('Short note');
    expect(toPlainTextPreview('a'.repeat(20), 10)).toBe(`${'a'.repeat(10)}…`);
  });

  it('keeps identifiers with underscores intact', () => {
    expect(toPlainTextPreview('Rename snake_case_name later')).toBe('Rename snake_case_name later');
  });

  it('omits fenced code blocks', () => {
    expect(toPlainTextPreview('Before\n```ts\nconst x = 1;\n```\nAfter')).toBe('Before After');
  });
});
