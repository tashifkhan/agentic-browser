// Builds the Agentic Browser deck.
//
//   node docs/deck/build.mjs [outDir]
//
// original.html is the deck as exported (slides 1 to 18, the May defence).
// since-the-report.html holds slides 19 onward in the same markup. This
// merges them into deck.html (standalone: screenshots from docs/screenshots
// are inlined), then renders every slide to <outDir>/png/NN.png at 2880x1920
// and the whole deck to <outDir>/deck.pdf.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.resolve(process.argv[2] ?? path.join(HERE, "out"));
fs.mkdirSync(path.join(OUT, "png"), { recursive: true });

let deck = fs.readFileSync(path.join(HERE, "original.html"), "utf8");
const extra = fs.readFileSync(path.join(HERE, "since-the-report.html"), "utf8");
const style = extra.match(/<style id="since-the-report">[\s\S]*?<\/style>/)[0];
const sections = extra.slice(extra.indexOf(style) + style.length).trim();

const end = deck.lastIndexOf("</div></main>");
if (end < 0) throw new Error("original.html: no </div></main> to insert before");
deck = deck.slice(0, end) + "\n" + sections + "\n\n" + deck.slice(end);
deck = deck.replace("</head>", style + "\n</head>");
deck = deck.replace(/SHOT:([a-z0-9-]+)/g, (_, name) => {
  const file = path.join(ROOT, "docs/screenshots", `${name}.png`);
  return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
});
const deckFile = path.join(HERE, "deck.html");
fs.writeFileSync(deckFile, deck);

// Show one slide at a time at its real size, with no viewer chrome or entrance animation.
const RENDER_CSS = `
  .ui-top,.ui-bot,.ui-prog,.nav-hit{display:none!important}
  html,body{overflow:hidden!important;background:#fff}
  #stage{position:fixed!important;inset:0!important}
  #canvas{position:absolute!important;left:0!important;top:0!important;transform:none!important}
  *,*::before,*::after{animation:none!important;transition:none!important}
`;
const PRINT_CSS = `
  @page{size:1440px 960px;margin:0}
  .ui-top,.ui-bot,.ui-prog,.nav-hit{display:none!important}
  html,body{overflow:visible!important;height:auto!important;background:#fff}
  #stage,#canvas{position:static!important;transform:none!important;width:auto!important;height:auto!important}
  .slide{display:grid!important;position:relative!important;break-after:page;page-break-after:always}
  *,*::before,*::after{animation:none!important;transition:none!important}
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
await page.goto("file://" + deckFile, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: RENDER_CSS });

const count = await page.locator("#canvas > .slide").count();
for (let i = 0; i < count; i++) {
  const report = await page.evaluate((i) => {
    const slides = [...document.querySelectorAll("#canvas > .slide")];
    slides.forEach((s, k) => s.classList.toggle("on", k === i));
    const s = slides[i];
    // Anything poking out of the slide, or under the closing band, means the copy is too long.
    const box = s.getBoundingClientRect();
    let worst = 0;
    s.querySelectorAll(".body *").forEach((el) => { worst = Math.max(worst, el.getBoundingClientRect().bottom - box.bottom); });
    const band = s.querySelector(":scope > div:last-child .close");
    const body = s.querySelector(":scope > .body, :scope > .cols.body");
    const overlap = band && body ? body.getBoundingClientRect().bottom - band.getBoundingClientRect().top : 0;
    return { title: s.dataset.title, out: Math.round(worst), overlap: Math.round(overlap) };
  }, i);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, "png", `${String(i + 1).padStart(2, "0")}.png`) });
  const flags = [report.out > 0 && `spills ${report.out}px`, report.overlap > 0 && `body over the band by ${report.overlap}px`].filter(Boolean);
  console.log(`${String(i + 1).padStart(2, "0")} ${report.title}${flags.length ? "  !! " + flags.join(", ") : ""}`);
}

const print = await browser.newPage();
await print.goto("file://" + deckFile, { waitUntil: "networkidle" });
await print.evaluate(() => document.fonts.ready);
await print.addStyleTag({ content: PRINT_CSS });
await print.evaluate(() => {
  try { renderMathInElement(document.getElementById("canvas"), { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "\\(", right: "\\)", display: false }], throwOnError: false }); } catch {}
});
await print.pdf({ path: path.join(OUT, "deck.pdf"), width: "1440px", height: "960px", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`\n${count} slides -> ${OUT}`);
