/**
 * Opt-in backfill for Markdown fidelity (issue #113 §1, decision P2-D1).
 *
 * Since #113, a page's `content` is derived from its blocks as Markdown (headings, lists,
 * to-dos, quotes, code, dividers; shared/block-markdown.ts). Pages last saved before that still
 * hold the legacy derivation (block texts joined by blank lines), so their reader view, table of
 * contents and search see plain paragraphs until the next edit. This script recomputes `content`
 * for them.
 *
 *   npx tsx scripts/rederive-page-content.ts             dry run: report what would change
 *   npx tsx scripts/rederive-page-content.ts --apply     write the new content
 *
 * Uses DATABASE_URL. Behaviour:
 * - Only pages with a non-empty `blocks` array are read. Pages without blocks (API-, template-
 *   or import-created) are never touched: their content is the source.
 * - A page is rewritten only when its stored content is exactly the legacy derivation of its
 *   blocks. Content that matches neither derivation was sent on purpose alongside the blocks;
 *   it is counted as "diverged" and left alone.
 * - Only `content` is written (the FTS trigger refreshes `search_vector`), guarded by the value
 *   just read, so a page edited meanwhile is skipped. No version is recorded, `updated_at` stays,
 *   and the link index needs no change (the derivation never alters link tokens). Trashed pages
 *   are included, so restoring one shows the same structure.
 * - Output is counts only: no page ids, titles or text.
 * - Non-local database hosts are refused unless --allow-remote is given.
 */
import pg from 'pg';
import { blocksToMarkdown } from '../shared/block-markdown';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const allowRemote = args.has('--allow-remote');
const label = apply ? '[rederive-content --apply]' : '[rederive-content dry-run]';
const BATCH_SIZE = 200;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** What the editor and server derived before #113: block texts joined by blank lines. */
function legacyContent(blocks: unknown[]): string {
  return blocks
    .map((block) =>
      block && typeof (block as { content?: unknown }).content === 'string'
        ? (block as { content: string }).content
        : ''
    )
    .join('\n\n');
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`${label} DATABASE_URL is not set.`);
    return 1;
  }
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    console.error(`${label} DATABASE_URL is not a valid URL.`);
    return 1;
  }
  if (!allowRemote && !LOCAL_HOSTS.has(host)) {
    console.error(`${label} Refusing non-local database host (pass --allow-remote).`);
    return 1;
  }

  const counts = { scanned: 0, current: 0, stale: 0, diverged: 0, written: 0, changedMeanwhile: 0 };
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    let lastId = 0;
    for (;;) {
      const { rows } = await client.query<{ id: number; content: string; blocks: unknown[] }>(
        `SELECT id, content, blocks FROM wiki_pages
          WHERE id > $1 AND jsonb_typeof(blocks) = 'array' AND jsonb_array_length(blocks) > 0
          ORDER BY id LIMIT $2`,
        [lastId, BATCH_SIZE]
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        lastId = row.id;
        counts.scanned++;
        const derived = blocksToMarkdown(row.blocks);
        if (row.content === derived) {
          counts.current++;
        } else if (row.content !== legacyContent(row.blocks)) {
          counts.diverged++;
        } else {
          counts.stale++;
          if (apply) {
            const result = await client.query(
              'UPDATE wiki_pages SET content = $1 WHERE id = $2 AND content = $3',
              [derived, row.id, row.content]
            );
            if (result.rowCount === 1) counts.written++;
            else counts.changedMeanwhile++;
          }
        }
      }
    }
  } finally {
    await client.end();
  }

  console.log(`${label} pages with blocks: ${counts.scanned}`);
  console.log(`${label} already Markdown: ${counts.current}`);
  console.log(`${label} legacy content to re-derive: ${counts.stale}`);
  console.log(`${label} diverged from their blocks (left alone): ${counts.diverged}`);
  if (apply) {
    console.log(`${label} written: ${counts.written}`);
    console.log(`${label} edited meanwhile (skipped): ${counts.changedMeanwhile}`);
  } else {
    console.log(`${label} nothing written; run again with --apply to write.`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // Connection and query failures: report the kind of failure, not the connection string.
    console.error(`${label} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exit(1);
  }
);
