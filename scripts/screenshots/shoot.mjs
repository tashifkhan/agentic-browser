// README screenshots with made-up data.
//
//   pnpm screenshots            regenerate docs/screenshots from the fixtures
//   pnpm screenshots --record   refresh fixtures from a backend on :5454 first
//
// No backend, keys or memories are needed: the console is built and served
// from a tiny local server, the extension runs in a throwaway Chromium
// profile, and every API call is answered from scripts/screenshots/fixtures
// (made-up data; recorded once, then edited by hand). Chat answers come from
// the scripted streams in demo.mjs. --record only proxies GET requests, so it
// never writes to your backend; read the new fixtures before committing them.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHATS, uploadFor } from "./demo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "docs/screenshots");
const FIX = path.join(HERE, "fixtures");
const CONSOLE_DIST = path.join(ROOT, "clients/debug-web/dist");
const EXT = path.join(ROOT, "clients/browser-extension/.output/chrome-mv3");
const RECORD = process.argv.includes("--record");
const REAL_API = "http://127.0.0.1:5454";
const missing = new Set();

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(FIX, { recursive: true });

// ── API answers ─────────────────────────────────────────────────────────────

const fixtureName = (method, url) => {
  const u = new URL(url, "http://x");
  return `${method}${(u.pathname + u.search).replace(/[^a-zA-Z0-9]+/g, "_")}`.replace(/_+$/, "").slice(0, 160) + ".json";
};

const json = (data, status = 200) => ({ status, type: "application/json", body: JSON.stringify(data) });

async function answer(method, url, body) {
  const u = new URL(url, "http://x");
  // Scripted bits: chat streams, uploads, and writes (never sent anywhere).
  if (u.pathname.endsWith("/stream") && method === "POST") {
    const question = JSON.parse(body || "{}").question || "";
    const chat = CHATS.find((c) => question.includes(c.match)) ?? CHATS[0];
    // Same framing as routers/react_agent.py: a named event plus its JSON.
    const events = chat.events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`).join("");
    return { status: 200, type: "text/event-stream", body: events };
  }
  if (u.pathname.startsWith("/api/upload/files/")) {
    return { status: 200, type: "image/png", body: fs.readFileSync(path.join(HERE, "assets", path.basename(u.pathname))) };
  }
  if (u.pathname === "/api/upload/" && method === "POST") return json(uploadFor());
  if (method !== "GET") return json({ ok: true, conversation_id: "conv_demo", message_id: "msg_demo" });

  const file = path.join(FIX, fixtureName(method, url));
  if (fs.existsSync(file)) return { status: 200, type: "application/json", body: fs.readFileSync(file) };
  if (RECORD) {
    const resp = await fetch(REAL_API + u.pathname + u.search).catch(() => null);
    if (resp?.ok && (resp.headers.get("content-type") || "").includes("json")) {
      const text = await resp.text();
      fs.writeFileSync(file, JSON.stringify(JSON.parse(text), null, 2));
      console.log(`  recorded ${path.basename(file)}`);
      return { status: 200, type: "application/json", body: text };
    }
  }
  missing.add(`${method} ${u.pathname}${u.search}`);
  return json({ detail: "not in the screenshot fixtures" }, 404);
}

// ── console: static build + API from fixtures ───────────────────────────────

function serveConsole() {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith("/api/")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const a = await answer(req.method, req.url, body);
      res.writeHead(a.status, { "content-type": a.type });
      return res.end(a.body);
    }
    let file = path.join(CONSOLE_DIST, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(CONSOLE_DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(CONSOLE_DIST, "index.html");
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Hide anything that could identify a machine, even in made-up data.
async function scrub(page) {
  await page.evaluate(() => {
    const fix = (s) => s.replace(/\/Users\/[^/\s]+/g, "~").replace(/\/home\/[^/\s]+/g, "~");
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode()); ) if (/\/Users\/|\/home\//.test(n.nodeValue)) n.nodeValue = fix(n.nodeValue);
  });
}

async function openSection(page, match) {
  const card = page.locator("section.ab-card").filter({ hasText: match }).first();
  await card.locator("button[aria-expanded]").first().evaluate((el) => el.getAttribute("aria-expanded") === "false" && el.click());
  await page.waitForTimeout(1200);
  return card;
}

async function shootConsole(base) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, colorScheme: "dark" });

  await page.goto(`${base}/dashboard`);
  await page.waitForTimeout(2500);
  await scrub(page);
  await page.screenshot({ path: `${OUT}/console-overview.png` });

  await page.goto(`${base}/memory`);
  await page.waitForTimeout(3500);
  await scrub(page);
  await page.screenshot({ path: `${OUT}/console-memory.png` });

  // Settings cards: a tall window so nothing scrolls, then one shot per card.
  await page.setViewportSize({ width: 1000, height: 6000 });
  await page.goto(`${base}/settings`);
  await page.waitForTimeout(2500);
  const subs = await openSection(page, "Run the agent on your Claude");
  await page.waitForTimeout(1200);
  await scrub(page);
  const cards = subs.locator(".set-runtime");
  await cards.filter({ hasText: "Claude (subscription)" }).first().screenshot({ path: `${OUT}/subscription-claude.png` });
  const ag = cards.filter({ hasText: "Google AI (Antigravity)" }).first();
  const box = await ag.boundingBox();
  const cut = await ag.getByText("Extra arguments").boundingBox();
  await page.screenshot({ path: `${OUT}/antigravity.png`, clip: { x: box.x, y: box.y, width: box.width, height: cut.y - box.y - 12 } });

  const voice = await openSection(page, "Speech in");
  await voice.getByRole("radio", { name: "One pass" }).click({ force: true });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll(".set-secrets").forEach((el) => {
    el.style.display = "none";
    if (/key/i.test(el.previousElementSibling?.textContent ?? "")) el.previousElementSibling.style.display = "none";
  }));
  await voice.screenshot({ path: `${OUT}/voice.png` });

  const model = await openSection(page, "Long chats");
  const top = await model.getByText("Long chats").first().boundingBox();
  const end = await model.getByText("API keys and endpoints").first().boundingBox();
  const mb = await model.boundingBox();
  await page.screenshot({ path: `${OUT}/long-chats.png`, clip: { x: mb.x, y: top.y - 16, width: mb.width, height: end.y - top.y + 4 } });

  const mcp = await openSection(page, "Tools that Claude Code, Codex, Cursor");
  await scrub(page);
  await mcp.screenshot({ path: `${OUT}/mcp-settings.png` });
  await browser.close();
}

// ── side panel: the real extension, API from fixtures ───────────────────────

async function shootPanel() {
  const profile = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "ab-shots-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 420, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    for (const host of ["http://localhost:5454/**", "http://127.0.0.1:5454/**"]) {
      await ctx.route(host, async (route) => {
        const req = route.request();
        const a = await answer(req.method(), req.url(), req.postData());
        await route.fulfill({ status: a.status, contentType: a.type, body: a.body, headers: { "access-control-allow-origin": "*" } });
      });
    }
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker");
    const id = sw.url().split("/")[2];
    await sw.evaluate(() => chrome.storage.local.set({ googleUser: { name: "Ada Lovelace", email: "ada@example.com" } }));
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/sidepanel.html`);
    await page.waitForTimeout(2000);

    // Hero: a finished multi-step answer with its work log open.
    const box = page.locator("textarea").first();
    await box.fill(CHATS[0].question);
    await box.press("Enter");
    await page.waitForSelector(`text=${CHATS[0].waitFor}`, { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.getByText(/Worked for/).first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/side-panel.png` });

    // Model picker, with subscription runtimes.
    await page.getByLabel("New chat").click();
    await page.waitForTimeout(600);
    await page.locator(".model-chip").click();
    await page.waitForTimeout(1500);
    await page.keyboard.type("sonnet");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/model-picker.png` });
    await page.keyboard.press("Escape");

    // An attached screenshot, answered.
    await page.locator("input[type=file]").setInputFiles(path.join(HERE, "assets", "checkout-error.png"));
    await page.waitForTimeout(1000);
    await box.fill(CHATS[1].question);
    await box.press("Enter");
    await page.waitForSelector(`text=${CHATS[1].waitFor}`, { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/image-attachment.png` });
  } finally {
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

// ── installer: a dry run, rendered as a terminal ────────────────────────────

async function shootInstaller() {
  const raw = execFileSync(path.join(ROOT, "install.sh"), ["--dry-run", "--yes", "--skip-browsers"], {
    cwd: ROOT, env: { ...process.env, FORCE_COLOR: "1" }, encoding: "utf8",
  }).replace(/\/(Users|home)\/[^/\s]+/g, "~");
  const colors = { "1": "font-weight:700;color:#f2f2f2", "1;36": "font-weight:700;color:#5fd7d7", "32": "color:#7ee787", "33": "color:#e3b341", "2": "color:#8b949e", "31": "color:#ff7b72", "1;32": "font-weight:700;color:#7ee787" };
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = raw.split(/(\x1b\[[0-9;]*m)/).map((part) => {
    const m = part.match(/^\x1b\[([0-9;]*)m$/);
    return m ? (m[1] === "0" ? "</span>" : `<span style="${colors[m[1]] ?? ""}">`) : esc(part);
  }).join("").trim();
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0d1117">
<div id="t" style="margin:24px;border-radius:12px;overflow:hidden;border:1px solid #30363d;width:880px;box-shadow:0 10px 40px #0008">
<div style="background:#161b22;padding:10px 14px;display:flex;gap:8px;align-items:center">${["#ff5f57", "#febc2e", "#28c840"].map((c) => `<span style="width:12px;height:12px;border-radius:50%;background:${c}"></span>`).join("")}
<span style="color:#8b949e;font:13px ui-monospace,Menlo;margin-left:10px">./install.sh</span></div>
<pre style="margin:0;padding:18px 20px;color:#c9d1d9;font:13.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap">${body}</pre></div></body>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 930, height: 1200 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.locator("#t").screenshot({ path: `${OUT}/installer.png` });
  await browser.close();
}

// ── main ────────────────────────────────────────────────────────────────────

if (!fs.existsSync(path.join(CONSOLE_DIST, "index.html"))) execFileSync("pnpm", ["build:debug"], { cwd: ROOT, stdio: "inherit" });
if (!fs.existsSync(path.join(EXT, "manifest.json"))) execFileSync("pnpm", ["build:extension"], { cwd: ROOT, stdio: "inherit" });

const server = await serveConsole();
const base = `http://127.0.0.1:${server.address().port}`;
try {
  console.log("console…");
  await shootConsole(base);
  console.log("side panel…");
  await shootPanel();
  console.log("installer…");
  await shootInstaller();
} finally {
  server.close();
}
if (missing.size) console.log(`\nNo fixture for:\n  ${[...missing].join("\n  ")}\n(run with --record against a backend, then edit the new files)`);
console.log(`\nWrote ${fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length} screenshots to docs/screenshots`);
