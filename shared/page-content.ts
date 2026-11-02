/**
 * The Markdown `content` of a block list, used by the server's save pipeline
 * (server/services/page-save.ts) and by the editor (client/src/lib/page-content.ts), so both
 * derive the same text. It lives in shared/block-markdown.ts (#113 §1), next to its inverse,
 * `markdownToBlocks`, which opens content-only pages and vault imports as blocks.
 */
export { blocksToMarkdown } from './block-markdown.js';
