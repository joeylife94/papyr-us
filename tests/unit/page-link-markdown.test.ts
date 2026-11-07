import { describe, expect, it } from 'vitest';
import { extractHeadings, toPlainTextPreview } from '../../client/src/lib/markdown';

// Page link tokens (#103 E6) carry only an id: the table of contents leaves them out (#113 §1
// derives TOC entries from the same tree the reader renders), and list previews name them
// "[링크]" without a title, as on main (#121).
describe('page link tokens outside the reader', () => {
  it('leaves tokens out of the table of contents and names them in list previews', () => {
    expect(extractHeadings('# Plan for [[page:3]]\n\n## [[page:4]]')).toEqual([
      { id: 'heading-plan-for', text: 'Plan for', level: 1 },
    ]);
    expect(toPlainTextPreview('See [[page:3]] here')).toBe('See [링크] here');
  });
});
