import { describe, expect, it } from 'vitest';
import { mapOutsideCode, parseFrontmatter } from '../../server/services/vault-format';
import { planVaultImport, renderImportedBodies } from '../../server/services/vault-import';
import { markdownToBlocks } from '../../shared/block-markdown';
import { parseInlineMarkdown } from '../../client/src/lib/inline-markdown';
import { markdownToHtml } from '../../client/src/lib/markdown';

// Imported files, page text and block text are untrusted (#113). These inputs used to take
// seconds to minutes (quadratic scans) or throw (spreading huge arrays); each must now finish
// well inside the bound. The bounds are generous so a slow CI machine does not flake.
const BOUND_MS = 2000;

function timed<T>(run: () => T): { result: T; ms: number } {
  const started = performance.now();
  const result = run();
  return { result, ms: performance.now() - started };
}

const source = (path: string, text: string) => ({
  path,
  segments: path.split('/'),
  size: Buffer.byteLength(text),
  read: () => Buffer.from(text),
});

describe('hostile input stays within bounds', () => {
  it('frontmatter with a long run of spaces parses in linear time', () => {
    const text = `---\ntitle: a${' '.repeat(1_000_000)}b\ntags: [x${' '.repeat(3000)}#c]\n---\nbody`;
    const { result, ms } = timed(() => parseFrontmatter(text));
    expect(ms).toBeLessThan(BOUND_MS);
    expect(result.body).toBe('body');
    // Lines longer than any field we read are skipped, not parsed.
    expect(result.data.title).toBeUndefined();
  });

  it('frontmatter comments are still stripped', () => {
    expect(parseFrontmatter('---\ntitle: Plan # draft\n---\n').data.title).toBe('Plan');
    expect(parseFrontmatter('---\ntitle: C#sharp\n---\n').data.title).toBe('C#sharp');
  });

  it('inline code with many unmatched backtick runs is mapped in linear time', () => {
    let text = '';
    for (let length = 1; text.length < 1_000_000; length++) text += `${'`'.repeat(length)} x `;
    let calls = 0;
    const { ms } = timed(() =>
      mapOutsideCode(text, (prose) => {
        calls++;
        return prose;
      })
    );
    expect(ms).toBeLessThan(BOUND_MS);
    expect(calls).toBeGreaterThan(0);
    // Matching runs still delimit code spans.
    expect(mapOutsideCode('a `b` c ``d`` e', (prose) => prose.toUpperCase())).toBe(
      'A `b` C ``d`` E'
    );
  });

  it('path-suffix wikilinks resolve with one lookup each', () => {
    // ~900 pages (the import's page cap is 1,000): the old lookup scanned all of them per link.
    const files = Array.from({ length: 900 }, (_, i) => source(`d/p${i}.md`, 'x'));
    files.push(source('notes/q/z.md', 'target'));
    files.push(source('big.md', '[[q/z]] '.repeat(120_000)));
    const plan = planVaultImport(files);
    const ids = plan.pages.map((_, index) => index + 1);
    const { result, ms } = timed(() => renderImportedBodies(plan, [], ids));
    expect(ms).toBeLessThan(BOUND_MS);
    const target = plan.pages.findIndex((page) => page.path === 'notes/q/z.md');
    const big = plan.pages.findIndex((page) => page.path === 'big.md');
    expect(result.contents[big].startsWith(`[[page:${ids[target]}]] `)).toBe(true);
    expect(result.unresolved).toEqual([]);
  });

  it('markdownToBlocks handles documents with hundreds of thousands of blocks', () => {
    const { result, ms } = timed(() => markdownToBlocks('a\n\n'.repeat(200_000)));
    expect(ms).toBeLessThan(BOUND_MS * 2);
    expect(result).toHaveLength(200_000);
  });

  it('the live preview tokenizer stays linear on unmatched brackets and backticks', () => {
    const brackets = timed(() => parseInlineMarkdown('['.repeat(1_000_000)));
    expect(brackets.ms).toBeLessThan(BOUND_MS);
    let ticks = '';
    for (let length = 1; ticks.length < 300_000; length++) ticks += `${'`'.repeat(length)} x `;
    const code = timed(() => parseInlineMarkdown(ticks));
    expect(code.ms).toBeLessThan(BOUND_MS);
    // Ordinary syntax still parses.
    expect(JSON.stringify(parseInlineMarkdown('[a](https://x.y) `c`'))).toContain('https://x.y');
  });

  it('the reader renders a text node with more tags than an argument list can spread', async () => {
    // Spreading the split nodes threw above ~75k tags and the reader fell back to escaped <pre>.
    // Rendering this many links is slow by nature (linear), so this checks the outcome only.
    const html = await markdownToHtml('#t '.repeat(80_000));
    expect(html).toContain('data-inline-tag="t"');
    expect(html).not.toContain('<pre>');
  }, 30_000);
});
