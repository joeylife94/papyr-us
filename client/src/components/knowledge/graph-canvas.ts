import { lazy, useEffect, useState, type RefObject } from 'react';

/**
 * react-force-graph-2d, loaded on first render (#111). Both the knowledge graph page and the
 * local graph panel use this one lazy component, so the library is a separate chunk and neither
 * the app shell nor the page view bundle carries it.
 */
export const ForceGraph2D = lazy(() => import('react-force-graph-2d'));

/** Canvas colours from the B · Graphite tokens, so the graph follows the light/dark theme. */
export interface GraphPalette {
  page: string;
  accent: string;
  tag: string;
  orphan: string;
  edge: string;
  tagEdge: string;
  aiEdge: string;
  label: string;
  labelMuted: string;
  halo: string;
}

function token(name: string, alpha = 1): string {
  const value =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Tokens are bare HSL channels ("74.5 84.7% 61.6%"); the comma form works in every canvas.
  const channels = value ? value.split(/\s+/).join(', ') : '0, 0%, 50%';
  return alpha < 1 ? `hsla(${channels}, ${alpha})` : `hsl(${channels})`;
}

function readPalette(): GraphPalette {
  return {
    page: token('--foreground-secondary'),
    accent: token('--primary'),
    tag: token('--warning'),
    orphan: token('--destructive'),
    edge: token('--muted-foreground', 0.55),
    tagEdge: token('--warning', 0.45),
    aiEdge: token('--info', 0.8),
    label: token('--foreground'),
    labelMuted: token('--muted-foreground'),
    halo: token('--background', 0.85),
  };
}

/** The graph palette, re-read whenever the theme class on <html> changes. */
export function useGraphPalette(): GraphPalette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return palette;
}

/** Content-box size of an element, kept current with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setSize({ width: Math.floor(element.clientWidth), height: Math.floor(element.clientHeight) });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * force-graph renders `nodeLabel` tooltips as HTML; titles are user content, so every label
 * goes through here.
 */
export function escapeGraphLabel(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
  );
}

/** A node's label text: its icon (if any) and title, shortened for the canvas. */
export function graphNodeText(
  title: string,
  icon: string | null | undefined,
  maxLength = 28
): string {
  const name = title.trim() || '제목 없음';
  const short = name.length > maxLength ? `${name.slice(0, maxLength - 1)}…` : name;
  return icon ? `${icon} ${short}` : short;
}

/** Draw a node as a dot with an optional label under it. */
export function drawGraphNode(
  ctx: CanvasRenderingContext2D,
  node: { x?: number; y?: number },
  options: {
    radius: number;
    color: string;
    label?: string;
    labelColor: string;
    halo: string;
    scale: number;
    ring?: string;
  }
) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  ctx.beginPath();
  ctx.arc(x, y, options.radius, 0, 2 * Math.PI);
  ctx.fillStyle = options.color;
  ctx.fill();
  if (options.ring) {
    ctx.lineWidth = 2 / options.scale;
    ctx.strokeStyle = options.ring;
    ctx.stroke();
  }
  if (!options.label) return;
  const fontSize = Math.max(11 / options.scale, 2);
  ctx.font = `${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const textY = y + options.radius + 2 / options.scale;
  ctx.lineWidth = 3 / options.scale;
  ctx.strokeStyle = options.halo;
  ctx.strokeText(options.label, x, textY);
  ctx.fillStyle = options.labelColor;
  ctx.fillText(options.label, x, textY);
}

/** A link end after force-graph resolved it to a node object, or still an id. */
export function linkEndId(end: unknown): string | number | undefined {
  if (end && typeof end === 'object') return (end as { id?: string | number }).id;
  return end as string | number | undefined;
}
