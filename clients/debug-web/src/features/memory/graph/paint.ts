import type { GraphNode } from "./buildGraph";
import type { Palette } from "./usePalette";

type Ctx = CanvasRenderingContext2D;
type State = { hovered: boolean; selected: boolean; dim: boolean; match: boolean };

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

/** Hub: a labelled disc with the claim count. Claim: a small coloured dot. */
export function paintNode(n: GraphNode, ctx: Ctx, scale: number, p: Palette, s: State) {
  const color = p.segment(n.segment);
  const x = n.x ?? 0;
  const y = n.y ?? 0;
  ctx.globalAlpha = s.dim ? 0.12 : 1;

  if (n.kind === "hub") {
    const halo = 26 + Math.sqrt(n.count ?? 1) * 8;
    ctx.beginPath();
    ctx.arc(x, y, halo, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(color, 0.08);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fillStyle = p.surface;
    ctx.fill();
    ctx.lineWidth = (s.hovered ? 2.5 : 1.5) / scale;
    ctx.strokeStyle = s.hovered ? color : p.line;
    ctx.stroke();
    ctx.fillStyle = p.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(String(n.count ?? 0), x, y + 0.5);
    if (scale > 0.45) {
      ctx.font = `600 ${Math.max(11, 12 / scale)}px ${FONT}`;
      ctx.fillStyle = s.hovered ? color : p.text;
      ctx.fillText(n.label, x, y - 13 - 12 / scale);
    }
  } else {
    const r = s.selected || s.hovered ? 4.5 : 3.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (s.selected || s.hovered || s.match) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3 / scale, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = s.match && !s.hovered && !s.selected ? color : p.text;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
