import { describe, expect, it } from 'vitest';
import { extractHeadings, markdownParts, markdownToHtml } from '../../client/src/lib/markdown';

// Issue #113 §4: a page with inline databases renders each Markdown run around them as its own
// document. Together the runs must read as the page's one document: link and footnote
// definitions resolve across a database, and no element id appears twice on the page.

/** The reader's HTML for each part, as PageReaderBody renders it ('' for a database). */
async function renderParts(parts: string[]) {
  return Promise.all(
    markdownParts(parts).map((part) =>
      part
        ? markdownToHtml(part.markdown, {
            takenHeadingIds: part.takenHeadingIds,
            footnoteIdPrefix: part.footnoteIdPrefix,
          })
        : ''
    )
  );
}

function ids(html: string) {
  return Array.from(html.matchAll(/ id="([^"]+)"/g), (m) => m[1]);
}

/** Ids the HTML points at: `#fragment` links and `aria-describedby`. */
function targets(html: string) {
  return Array.from(html.matchAll(/ (?:href="#|aria-describedby=")([^"]+)"/g), (m) => m[1]);
}

describe('a page rendered in parts around inline databases', () => {
  it('resolves reference links defined in another part', async () => {
    const parts = [
      'Read [the guide][guide] first.\n\n[early]: https://example.com/early',
      '',
      'Then [early] and [quoted].\n\n- [listed]: https://example.com/listed',
      '',
      '[guide]: https://example.com/guide "Guide"\n\n> [quoted]: https://example.com/quoted\n> "Quoted"\n\nSee [listed].',
    ];
    const [first, , second, , third] = await renderParts(parts);
    expect(first).toBe(
      '<p>Read <a href="https://example.com/guide" title="Guide">the guide</a> first.</p>'
    );
    expect(second).toContain('<a href="https://example.com/early">early</a>');
    // A definition inside a quote, its title on a second line.
    expect(second).toContain('<a href="https://example.com/quoted" title="Quoted">quoted</a>');
    // A definition inside a list item.
    expect(third).toContain('<p>See <a href="https://example.com/listed">listed</a>.</p>');
  });

  it('lists a footnote cited before a database and defined after it', async () => {
    const parts = ['Text[^1].', '', '[^1]: A note.\n\n[^2]: Never cited.'];
    const [html] = await renderParts(parts);
    const ref =
      /<a href="#([^"]+)" id="([^"]+)" data-footnote-ref aria-describedby="([^"]+)">1<\/a>/.exec(
        html
      );
    expect(ref).not.toBeNull();
    const [, footnote, reference, label] = ref!;
    // The footnote is listed with a link back to the reference.
    expect(html).toContain(`<li id="${footnote}">\n<p>A note. <a href="#${reference}"`);
    expect(ids(html)).toEqual(expect.arrayContaining([footnote, reference, label]));
    expect(html).not.toContain('Never cited');
    // The part with only definitions shows nothing (it would render empty).
    expect(markdownParts(parts)[2]).toBeNull();
  });

  it('keeps every element id unique, and every link to an id inside its part', async () => {
    const parts = [
      '# Intro\n\nFirst[^a] and [^b].\n\n[^a]: Note a.',
      '',
      '# Intro\n\nAgain[^a][^b].\n\n[^b]: Note b.',
      '',
      '## Close\n\nLast[^b].',
    ];
    const rendered = await renderParts(parts);
    const all = rendered.flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
    for (const html of rendered) {
      for (const target of targets(html)) expect(ids(html)).toContain(target);
    }
    // Every part cites footnotes, so each lists its own.
    expect(rendered.filter((html) => html.includes('data-footnotes'))).toHaveLength(3);

    // Headings keep the ids of the whole page, which the table of contents links to; the
    // footnote labels keep their own ids and stay out of it.
    const headings = rendered.flatMap((html) =>
      Array.from(html.matchAll(/<h[1-6](?: class="[^"]*")? id="(heading-[^"]+)"/g), (m) => m[1])
    );
    const toc = extractHeadings(parts.join('\n\n')).map((heading) => heading.id);
    expect(headings).toEqual(toc);
    expect(toc).toEqual(['heading-intro', 'heading-intro-1', 'heading-close']);
  });

  it('keeps a definition with an unsafe URL inert', async () => {
    const parts = [
      '[Click][bad], [quoted][worse] and [safe][good]',
      '',
      '[bad]: javascript:alert(1)\n\n> [worse]: javascript:alert(2)\n> "t"\n\n[good]: https://example.com',
    ];
    const [html] = await renderParts(parts);
    expect(html).toBe(
      '<p><a>Click</a>, <a title="t">quoted</a> and <a href="https://example.com">safe</a></p>'
    );
  });

  it('renders a page without databases as before', async () => {
    // PageReaderBody renders such a page's `content` in one piece, with no part options.
    const content = 'Text[^1] and [Guide][guide].\n\n[guide]: https://example.com\n\n[^1]: A note.';
    expect(await markdownToHtml(content)).toBe(
      '<p>Text<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref aria-describedby="footnote-label">1</a></sup> and <a href="https://example.com">Guide</a>.</p>\n' +
        '<section data-footnotes class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2>\n' +
        '<ol>\n' +
        '<li id="user-content-fn-1">\n' +
        '<p>A note. <a href="#user-content-fnref-1" data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref">↩</a></p>\n' +
        '</li>\n' +
        '</ol>\n' +
        '</section>'
    );
  });
});
