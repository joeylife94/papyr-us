/**
 * Layer 1 Unit · Search snippets must never be rendered as HTML.
 *
 * Retrieval snippets come from `ts_headline` over raw page content. Postgres does
 * not sanitise them — an attribute-bearing tag such as `<img src=x onerror=...>`
 * survives verbatim (proved in tests/integration-layer4/retrieval-fts.test.ts).
 * The only thing standing between that and script execution is the render path,
 * so this test guards it statically.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(repoRoot, 'client/src/components/search/ai-search.tsx'), 'utf-8');

/** Strip comments so a comment mentioning a banned API cannot mask or fake a match. */
const searchComponent = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('AI search result rendering', () => {
  it('never uses dangerouslySetInnerHTML', () => {
    expect(searchComponent).not.toContain('dangerouslySetInnerHTML');
  });

  it('renders the snippet as a JSX text node', () => {
    expect(searchComponent).toContain('{result.snippet}');
  });

  it('displays the server-assigned rank rather than deriving a percentage', () => {
    // ftsScore and aiScore use different scales; showing either as a percentage
    // would present them as comparable when they are not.
    expect(searchComponent).toContain('{result.rank}');
    expect(searchComponent).not.toContain('Math.round(result.');
  });
});
