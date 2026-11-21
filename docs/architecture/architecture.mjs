// Draws docs/architecture-{light,dark}.svg in an Excalidraw style: rough.js
// strokes and solid pastel fills, Excalidraw's Virgil hand font (OFL) embedded as
// a subset. The dark file is the light one run through Excalidraw's own dark
// mode filter.
//   npm i --no-save roughjs@4.6.6 && node docs/architecture/architecture.mjs docs docs/architecture
import rough from "roughjs";
import { readFileSync, writeFileSync } from "node:fs";

const [OUT, FONTS] = process.argv.slice(2);
const W = 1240, H = 900;
const gen = rough.generator();
let seed = 7;

const INK = "#1e1e1e";
const MUTED = "#495057";
const C = {
  blue: "#a5d8ff", green: "#b2f2bb", yellow: "#ffec99", red: "#ffc9c9",
  violet: "#d0bfff", cyan: "#99e9f2", orange: "#ffd8a8", grey: "#e9ecef",
  teal: "#0c8599", wire: "#1971c2", groupInk: "#e8590c",
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const out = [];

function emit(drawable, extra = "") {
  for (const p of gen.toPaths(drawable)) {
    out.push(`<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill || "none"}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`);
  }
}

function roundRect(x, y, w, h, r = 14) {
  return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}

function text(x, y, s, { size = 17, color = INK, anchor = "start", mono = false } = {}) {
  const fam = mono ? "Cascadia" : "Virgil";
  out.push(`<text x="${x}" y="${y}" font-family="${fam}, Segoe Print, Comic Sans MS, cursive" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`);
}

function card(x, y, w, h, title, lines, fill, { monoTitle = false } = {}) {
  emit(gen.path(roundRect(x, y, w, h), {
    seed: seed++, stroke: INK, strokeWidth: 1.6, roughness: 1.1, bowing: 1.2,
    fill, fillStyle: "solid",
  }));
  text(x + 18, y + 32, title, { size: 21, mono: monoTitle });
  lines.forEach((l, i) => {
    const mono = l.startsWith("`");
    text(x + 18, y + 60 + i * 23, l.replace(/`/g, ""), { size: mono ? 14.5 : 16.5, color: mono ? C.teal : MUTED, mono });
  });
}

function group(x, y, w, h, title, sub) {
  emit(gen.path(roundRect(x, y, w, h, 22), { seed: seed++, stroke: C.groupInk, strokeWidth: 1.8, roughness: 1.4, bowing: 1.5 }),
    ' stroke-dasharray="10 9"');
  text(x + 22, y - 12, title, { size: 24, color: C.groupInk });
  if (sub) text(x + 30 + title.length * 12.6, y - 12, sub, { size: 16, color: MUTED });
}

function arrow(points, { both = false, label, lx, ly, anchor = "start", color = C.wire } = {}) {
  const opts = { seed: seed++, stroke: color, strokeWidth: 2, roughness: 1.3, bowing: 2 };
  emit(points.length === 2 ? gen.line(...points[0], ...points[1], opts) : gen.linearPath(points, opts));
  const head = (tip, from) => {
    const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    for (const da of [0.45, -0.45]) {
      const a = ang + Math.PI + da;
      emit(gen.line(tip[0], tip[1], tip[0] + 15 * Math.cos(a), tip[1] + 15 * Math.sin(a), { ...opts, seed: seed++, roughness: 0.8 }));
    }
  };
  head(points.at(-1), points.at(-2));
  if (both) head(points[0], points[1]);
  if (label) text(lx, ly, label, { size: 16, color, anchor });
}

// ── layout ──────────────────────────────────────────────────────────────

group(40, 78, 1160, 190, "your browser", "(chrome or firefox)");
card(66, 104, 340, 140, "side panel", ["chat, voice, slash commands", "model picker, work log", "the extension UI (WXT)"], C.blue);
card(452, 104, 340, 140, "action runner", ["content scripts + chrome.debugger", "trusted clicks and typing", "page glow while it acts"], C.blue);
card(838, 104, 340, 140, "your tabs", ["real pages, already logged in", "agent tabs get their own group"], C.blue);
arrow([[410, 174], [448, 174]]);
arrow([[796, 174], [834, 174]]);

group(40, 352, 770, 390, "backend", "(FastAPI, port 5454)");
card(62, 376, 360, 160, "agents (langgraph)", ["ReAct agent picks its own tools", "browser planner, one checked step", "supervisor plans, delegates, grades", "loop guard stops circling runs"], C.violet);
card(440, 376, 350, 160, "tools", ["web search, website + YouTube Q&A", "GitHub, Gmail, Calendar", "skills: docx, pptx, xlsx", "JIIT portal, whisper voice"], C.yellow);
card(62, 556, 360, 164, "models", ["picked per request in the panel", "lists from models.dev, or your", "endpoint's own /v1/models", "bring your own keys"], C.green);
card(440, 556, 350, 164, "memory", ["extracts + reconciles facts", "hybrid recall, fused with RRF", "graph expansion, two hops out", "decay, dedup, forget"], C.red);

card(860, 352, 340, 84, "coding agents", ["Claude Code, Codex, Cursor, OpenCode"], C.grey);
card(860, 478, 340, 196, "agentic-mcp", ["`bridge on 127.0.0.1:5455", "browser_tabs, browser_snapshot,", "browser_act, browser_execute", "memory_recall / save / profile /", "documents / forget", "memory tools call the backend"], C.cyan, { monoTitle: true });
card(860, 696, 340, 86, "debug console + telegram", ["runs, memory graph, settings"], C.orange);

card(40, 790, 382, 92, "model providers", ["Google, OpenAI, Anthropic, DeepSeek,", "OpenRouter, Ollama, your own server"], C.green);
card(440, 790, 370, 92, "memory stores", ["Postgres (truth), Neo4j (graph),", "OpenSearch (vectors + BM25)"], C.red);

// wires
arrow([[370, 248], [370, 372]], { both: true, label: "HTTP + SSE", lx: 384, ly: 296 });
text(384, 318, "picked model rides in headers", { size: 14.5, color: MUTED });
arrow([[1030, 440], [1030, 474]], { label: "MCP (stdio / HTTP)", lx: 1044, ly: 463 });
arrow([[856, 520], [832, 520], [832, 300], [622, 300], [622, 250]], { label: "websocket /bridge/ws", lx: 636, ly: 292 });
text(636, 316, "the extension dials out", { size: 14.5, color: MUTED });
arrow([[856, 648], [814, 648]]);
arrow([[856, 738], [814, 738]]);
arrow([[240, 724], [240, 786]]);
arrow([[615, 724], [615, 786]]);

text(860, 820, "bridge only listens on 127.0.0.1.", { size: 15, color: MUTED });
text(860, 844, "memories stay on your machine.", { size: 15, color: MUTED });

// ── write ───────────────────────────────────────────────────────────────
const font = (name, file) =>
  `@font-face { font-family: "${name}"; src: url(data:font/woff2;base64,${readFileSync(`${FONTS}/${file}`).toString("base64")}) format("woff2"); }`;
const style = `<style>${font("Virgil", "Virgil-sub.woff2")} ${font("Cascadia", "Cascadia-sub.woff2")}</style>`;
const body = out.join("\n");

function svg(dark) {
  // Excalidraw's dark mode is this exact filter over the light drawing.
  const open = dark ? `<g style="filter: invert(93%) hue-rotate(180deg)">` : "<g>";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Agentic Browser architecture">
<title>Agentic Browser architecture</title>
<defs>${style}</defs>
${open}<rect width="${W}" height="${H}" fill="#ffffff"/>
${body}
</g></svg>
`;
}

writeFileSync(`${OUT}/architecture-light.svg`, svg(false));
writeFileSync(`${OUT}/architecture-dark.svg`, svg(true));
