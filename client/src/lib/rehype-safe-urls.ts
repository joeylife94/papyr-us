/**
 * Drops link and media URLs whose scheme is not on an allowlist. Page content is untrusted:
 * Markdown such as `[x](javascript:alert(1))` would otherwise render a link that runs script
 * when a reader clicks it. Relative URLs, fragments and protocol-relative URLs stay.
 */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const URL_PROPERTIES = ['href', 'src', 'xLinkHref', 'poster', 'cite', 'action', 'formAction'];

export function isSafeUrl(value: string): boolean {
  // Browsers ignore ASCII whitespace and control characters inside a scheme ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  const normalized = value.replace(/[\u0000- \u007f]+/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized);
  return !scheme || SAFE_SCHEMES.has(scheme[0]);
}

type HastNode = {
  type: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function stripUnsafeUrls(node: HastNode) {
  if (node.type === 'element' && node.properties) {
    for (const key of URL_PROPERTIES) {
      const value = node.properties[key];
      if (typeof value === 'string' && !isSafeUrl(value)) delete node.properties[key];
    }
  }
  node.children?.forEach(stripUnsafeUrls);
}

/** Rehype plugin: run after every plugin that adds elements, before stringifying. */
export function rehypeSafeUrls() {
  return (tree: HastNode) => stripUnsafeUrls(tree);
}
