import { MarkdownRenderer } from '@/components/wiki/markdown-renderer';
import { markdownParts } from '@/lib/markdown';
import { blocksToContent } from '@/lib/page-content';
import { readDatabaseProperties } from '@/lib/inline-database';
import type { Block } from '@shared/schema';
import { InlineDatabase } from './inline-database';

type Segment = { kind: 'markdown'; blocks: Block[] } | { kind: 'database'; block: Block };

/**
 * The page body split around its database blocks, in page order. Runs of other blocks stay one
 * Markdown segment each; a database block without a database yet is left out.
 */
export function splitDatabaseSegments(blocks: Block[]): Segment[] {
  const segments: Segment[] = [];
  for (const block of blocks) {
    if (block?.type === 'database_inline') {
      if (readDatabaseProperties(block.properties).schemaId) {
        segments.push({ kind: 'database', block });
      }
      continue;
    }
    const last = segments[segments.length - 1];
    if (last?.kind === 'markdown') last.blocks.push(block);
    else segments.push({ kind: 'markdown', blocks: [block] });
  }
  return segments;
}

/**
 * The reader's page body (#113 §4). A page's `content` is Markdown and cannot carry database
 * rows, so a page with database blocks renders in place from its blocks: each run of other
 * blocks as Markdown (the same derivation the editor and server use, `blocksToContent`), each
 * database block as the read-only database, which loads its rows with the reader's own access.
 * Pages without database blocks render `content` exactly as before.
 */
export function PageReaderBody({
  page,
  className,
}: {
  page: { content: string; blocks?: unknown };
  className?: string;
}) {
  const blocks = Array.isArray(page.blocks) ? (page.blocks as Block[]) : [];
  const segments = blocks.some((block) => block?.type === 'database_inline')
    ? splitDatabaseSegments(blocks)
    : null;

  if (!segments) return <MarkdownRenderer content={page.content} className={className} />;

  // Each part renders as its own Markdown document; `markdownParts` makes them read as the one
  // document the page is: definitions shared, footnote ids unique, heading ids continued (the
  // table of contents is built from the whole `content`).
  const parts = markdownParts(
    segments.map((segment) => (segment.kind === 'markdown' ? blocksToContent(segment.blocks) : ''))
  );

  return (
    <div className="space-y-4">
      {segments.map((segment, index) => {
        if (segment.kind === 'markdown') {
          const part = parts[index];
          return part ? (
            <MarkdownRenderer
              key={`md-${index}`}
              content={part.markdown}
              className={className}
              takenHeadingIds={part.takenHeadingIds}
              footnoteIdPrefix={part.footnoteIdPrefix}
            />
          ) : null;
        }
        return (
          <InlineDatabase
            key={segment.block.id}
            schemaId={readDatabaseProperties(segment.block.properties).schemaId as number}
            config={readDatabaseProperties(segment.block.properties)}
            readOnly
          />
        );
      })}
    </div>
  );
}
