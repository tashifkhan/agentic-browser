import type { GraphLink, GraphNode } from "./buildGraph";
import type { Palette } from "./usePalette";

type Ctx = CanvasRenderingContext2D;
type State = { hovered: boolean; selected: boolean; dim: boolean; match: boolean; neighbour: boolean };

/** Apply an alpha to a hex or rgb() colour. */
export function withAlpha(color: string, a: number): string {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const rgb = color.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(",").map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}

const FONT = '"Hanken Grotesk Variable", system-ui, sans-serif';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Entity: a disc with its name underneath, always labelled so the graph reads
 * at a glance. Claim: a small dot in its segment colour; superseded claims are
 * hollow. Claims get a short label when zoomed in or highlighted.
 */
export function paintNode(n: GraphNode, ctx: Ctx, scale: number, p: Palette, s: State) {
  const x = n.x ?? 0;
  const y = n.y ?? 0;
  ctx.globalAlpha = s.dim ? 0.13 : n.faded ? 0.55 : 1;

  if (n.kind === "entity") {
    const r = n.size;
    const color = p.entity(n.group);
    ctx.beginPath();
    ctx.arc(x, y, r + (s.hovered || s.selected ? 4 : 0), 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(color, s.hovered || s.selected ? 0.22 : 0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = p.surface;
    ctx.fill();
    ctx.lineWidth = (s.selected ? 2.4 : 1.6) / scale;
    ctx.strokeStyle = s.selected || s.hovered || s.match ? color : withAlpha(color, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const fontPx = Math.max(10.5, 12 / scale);
    ctx.font = `${s.selected || s.hovered ? 650 : 600} ${fontPx}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const label = clip(n.label, 28);
    const ty = y + r + 3 / scale;
    // Halo so labels stay readable over edges.
    ctx.lineWidth = 3.5 / scale;
    ctx.strokeStyle = p.bg;
    ctx.strokeText(label, x, ty);
    ctx.fillStyle = p.text;
    ctx.fillText(label, x, ty);
  } else {
    const color = p.segment(n.group);
    const r = s.selected || s.hovered ? n.size + 1.6 : n.size;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (n.faded) {
      ctx.fillStyle = p.surface;
      ctx.fill();
      ctx.lineWidth = 1.4 / scale;
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    if (s.selected || s.hovered || s.match) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3 / scale, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = s.selected || s.hovered ? p.text : color;
      ctx.stroke();
    }
    if (scale > 2.2 || s.match || s.neighbour || s.selected) {
      const fontPx = Math.max(9, 10.5 / scale);
      ctx.font = `500 ${fontPx}px ${FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const label = clip(n.label, scale > 4 ? 64 : 36);
      ctx.lineWidth = 3 / scale;
      ctx.strokeStyle = p.bg;
      ctx.strokeText(label, x + r + 4 / scale, y);
      ctx.fillStyle = p.muted;
      ctx.fillText(label, x + r + 4 / scale, y);
    }
  }
  ctx.globalAlpha = 1;
}

/** Line colour per link kind. History links stand out; structure links stay quiet. */
export function linkColor(l: GraphLink, p: Palette, emphasis: "dim" | "normal" | "strong"): string {
  const base = l.kind === "supersedes" ? p.warn : l.kind === "contradicts" ? p.err : p.line;
  if (emphasis === "dim") return withAlpha(base, 0.12);
  if (emphasis === "strong") return l.kind === "subject" || l.kind === "object" ? p.muted : base;
  return l.kind === "subject" || l.kind === "object" ? withAlpha(base, 0.9) : base;
}
