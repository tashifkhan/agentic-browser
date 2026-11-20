// Bridge method handlers. Each MCP tool call arrives here as {method, params}.
// Input goes through chrome.debugger when possible, because those events are
// trusted (isTrusted=true) and behave like a real user. Synthetic DOM events
// are the fallback for subframes, Firefox, and tabs where DevTools is open.

import { browser, type Browser } from "wxt/browser";
import * as cdp from "./cdp";
import { pageAgent, type PageOp } from "./page-agent";

type Params = Record<string, any>;

const RESTRICTED = /^(chrome|edge|brave|about|devtools|chrome-extension|moz-extension|view-source):|^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/;

// ── utilities ───────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normaliseUrl(url: string): string {
  const u = String(url || "").trim();
  if (!u) throw new Error("url is required");
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(u)) return `http://${u}`;
  return `https://${u}`;
}

async function resolveTab(tabId?: number | null): Promise<Browser.tabs.Tab> {
  if (typeof tabId === "number") {
    try {
      return (await browser.tabs.get(tabId)) as Browser.tabs.Tab;
    } catch {
      throw new Error(`Tab ${tabId} does not exist. Use browser_tabs to list tabs.`);
    }
  }
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const fallback = tab ?? (await browser.tabs.query({ active: true }))[0];
  if (!fallback?.id) throw new Error("No active tab found");
  return fallback as Browser.tabs.Tab;
}

function assertScriptable(tab: Browser.tabs.Tab) {
  if (tab.url && RESTRICTED.test(tab.url)) {
    throw new Error(`Chrome does not let extensions script ${tab.url}. Navigate the tab to a website first.`);
  }
}

function tabInfo(tab: Browser.tabs.Tab) {
  return { tabId: tab.id, url: tab.url ?? tab.pendingUrl ?? "", title: tab.title ?? "" };
}

async function freshInfo(tabId: number) {
  try {
    return tabInfo((await browser.tabs.get(tabId)) as Browser.tabs.Tab);
  } catch {
    return { tabId, url: "", title: "(tab closed)" };
  }
}

async function runPage<T = any>(tabId: number, frameId: number, op: PageOp, args: Params = {}, timeoutMs = 10_000): Promise<T> {
  const exec = browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: pageAgent,
    args: [op, args],
  });
  const results = await withTimeout(
    exec,
    timeoutMs,
    cdp.pendingDialog(tabId)
      ? "The page is blocked by an open dialog. Answer it with action=dialog."
      : "The page did not respond in time (it may be busy or showing a dialog).",
  );
  const envelope = results?.[0]?.result as { ok: boolean; v?: T; e?: string } | undefined;
  if (!envelope) throw new Error("The page returned no result (frame gone or navigating)");
  if (!envelope.ok) throw new Error(envelope.e);
  return envelope.v as T;
}

/** Split "f12e5" into frame 12 + target. Selectors and text= go to the main frame. */
function frameOf(target?: string): number {
  const m = String(target ?? "").trim().match(/^\[?(?:ref=)?f(\d+)e\d+\]?$/);
  return m ? Number(m[1]) : 0;
}

function waitForLoad(tabId: number, timeoutMs: number, sawLoading = false): Promise<boolean> {
  return new Promise((resolve) => {
    let loading = sawLoading;
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(listener);
      resolve(ok);
    };
    const listener = (id: number, info: { status?: string; url?: string }) => {
      if (id !== tabId) return;
      if (info.status === "loading" || info.url) loading = true;
      if (info.status === "complete" && loading) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    browser.tabs.onUpdated.addListener(listener);
    if (loading) {
      browser.tabs.get(tabId).then((t) => t.status === "complete" && finish(true)).catch(() => finish(false));
    }
  });
}

/** After an input action, wait for a navigation it may have started. */
async function settle(tabId: number, timeoutMs: number): Promise<string | undefined> {
  await sleep(200);
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === "loading") {
      const done = await waitForLoad(tabId, Math.min(timeoutMs, 15_000), true);
      return done ? "page navigated" : "page still loading";
    }
  } catch {
    return "tab closed";
  }
  return undefined;
}

// ── screenshots ─────────────────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function downscale(dataUrl: string, maxWidth = 1280): Promise<string> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bmp = await createImageBitmap(blob);
    if (bmp.width <= maxWidth) return dataUrl;
    const h = Math.round((bmp.height * maxWidth) / bmp.width);
    const canvas = new OffscreenCanvas(maxWidth, h);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, maxWidth, h);
    const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.75 });
    return `data:image/jpeg;base64,${toBase64(await out.arrayBuffer())}`;
  } catch {
    return dataUrl;
  }
}

async function captureTab(tab: Browser.tabs.Tab): Promise<string> {
  if (tab.active) {
    try {
      return await downscale(await browser.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 }));
    } catch {
      /* fall through to CDP */
    }
  }
  if (cdp.cdpAvailable() && (await cdp.attach(tab.id!))) {
    const r = await withTimeout(
      cdp.send<{ data: string }>(tab.id!, "Page.captureScreenshot", { format: "jpeg", quality: 70 }),
      8000,
      "Screenshot timed out (background tabs may not paint). Focus the tab and retry.",
    );
    return downscale(`data:image/jpeg;base64,${r.data}`);
  }
  throw new Error("Screenshots of background tabs need chrome.debugger. Focus the tab first.");
}

// ── tabs ────────────────────────────────────────────────────────────────────

const agentGroups = new Map<number, number>(); // windowId -> groupId

async function addToAgentGroup(tab: Browser.tabs.Tab) {
  const tabs = (globalThis as any).chrome?.tabs;
  const groups = (globalThis as any).chrome?.tabGroups;
  if (!tabs?.group || !groups || tab.id == null) return;
  try {
    let groupId = agentGroups.get(tab.windowId);
    if (groupId != null) {
      try {
        await groups.get(groupId);
      } catch {
        groupId = undefined;
      }
    }
    groupId = await tabs.group({ tabIds: [tab.id], ...(groupId != null ? { groupId } : { createProperties: { windowId: tab.windowId } }) });
    agentGroups.set(tab.windowId, groupId!);
    await groups.update(groupId, { title: "Agent", color: "purple" });
  } catch {
    /* grouping is cosmetic */
  }
}

async function tabsList() {
  const tabs = await browser.tabs.query({});
  return tabs.map((t) => ({ id: t.id, url: t.url ?? t.pendingUrl ?? "", title: t.title ?? "", active: t.active, windowId: t.windowId }));
}

async function tabsOpen(p: Params) {
  const url = normaliseUrl(p.url);
  const tab = (await browser.tabs.create({ url, active: p.active !== false })) as Browser.tabs.Tab;
  await addToAgentGroup(tab);
  await waitForLoad(tab.id!, Number(p.timeoutMs) || 20_000, true);
  const info = await freshInfo(tab.id!);
  return { id: tab.id, url: info.url, title: info.title };
}

async function tabsClose(p: Params) {
  await browser.tabs.remove(Number(p.tabId));
  return { ok: true };
}

async function tabsFocus(p: Params) {
  const tab = await browser.tabs.update(Number(p.tabId), { active: true });
  if (tab?.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
  return { ok: true };
}

// ── snapshot ────────────────────────────────────────────────────────────────

const refCounters = new Map<string, number>();

async function snapshotFrame(tabId: number, frameId: number, maxChars: number) {
  const key = `${tabId}:${frameId}`;
  const res = await runPage<any>(tabId, frameId, "snapshot", {
    maxChars,
    prefix: frameId ? `f${frameId}` : "",
    startAt: refCounters.get(key) ?? 1,
  }, frameId ? 4000 : 10_000);
  refCounters.set(key, res.next);
  return res;
}

async function pageSnapshot(p: Params) {
  const tab = await resolveTab(p.tabId);
  assertScriptable(tab);
  const tabId = tab.id!;
  const maxChars = Math.max(2000, Math.min(Number(p.maxChars) || 25_000, 100_000));

  const main = await snapshotFrame(tabId, 0, maxChars);
  const parts: string[] = [`url: ${main.url}`, `title: ${main.title}`, main.scroll];
  const dialog = cdp.pendingDialog(tabId);
  if (dialog) parts.push(`dialog open (${dialog.type}): ${JSON.stringify(dialog.message)}. Answer it with action=dialog.`);
  parts.push(main.text || "(no visible content)");
  if (main.truncated) parts.push(`(outline truncated at ${maxChars} chars; scroll, raise max_chars, or read with evaluate)`);

  // Subframes such as embedded forms and editors get their own sections.
  try {
    const frames = ((await browser.webNavigation.getAllFrames({ tabId })) ?? [])
      .filter((f) => f.frameId !== 0 && /^https?:/.test(f.url))
      .slice(0, 8);
    const results = await Promise.all(
      frames.map((f) => snapshotFrame(tabId, f.frameId, Math.floor(maxChars / 3)).then((r) => ({ f, r })).catch(() => null)),
    );
    for (const item of results) {
      if (!item || !item.r.text || item.r.area < 120 * 60) continue;
      const body = item.r.text.split("\n").map((l: string) => "  " + l).join("\n");
      parts.push(`- frame ${item.f.frameId} ${JSON.stringify(item.r.url)}:\n${body}`);
    }
  } catch {
    /* webNavigation unavailable */
  }

  const out: Params = { tabId, url: main.url, title: main.title, text: parts.join("\n") };
  if (p.screenshot) {
    try {
      out.screenshot = await captureTab(tab);
    } catch (err) {
      out.screenshotError = (err as Error).message;
    }
  }
  return out;
}

async function pageScreenshot(p: Params) {
  const tab = await resolveTab(p.tabId);
  return { tabId: tab.id, dataUrl: await captureTab(tab) };
}

// ── actions ─────────────────────────────────────────────────────────────────

async function trustedClick(tabId: number, target: string, clickCount: number, button: string, timeoutMs: number) {
  const frameId = frameOf(target);
  if (frameId === 0 && (await cdp.attach(tabId))) {
    const g = await runPage<any>(tabId, 0, "resolve", { target }, timeoutMs);
    if (g.width === 0 && g.height === 0) throw new Error(`${g.desc} has no size on screen (hidden or collapsed)`);
    if (g.covered) {
      // Something sits on top (overlay, sticky header, cookie banner). A
      // real click would hit that element, so dispatch on the target instead.
      await runPage(tabId, 0, "click", { target, clickCount }, timeoutMs);
      return { note: `${g.desc} was covered by ${g.covered}; used a DOM click instead` };
    }
    const raced = await cdp.raceDialog(tabId, cdp.mouseClick(tabId, g.x, g.y, button, clickCount));
    return { dialog: raced.dialog, desc: g.desc };
  }
  const r = await runPage<any>(tabId, frameId, "click", { target, clickCount }, timeoutMs);
  return { desc: r.desc, note: frameId ? "clicked inside a frame with a DOM click" : "clicked with a DOM click (debugger unavailable)" };
}

async function pageAct(p: Params) {
  const tab = await resolveTab(p.tabId);
  const tabId = tab.id!;
  const action = String(p.action);
  const timeoutMs = Math.min(Number(p.timeoutMs) || 10_000, 120_000);
  const target: string | undefined = p.target ?? undefined;
  let note: string | undefined;
  let dialog: cdp.DialogInfo | undefined;

  const pending = cdp.pendingDialog(tabId);
  if (pending && action !== "dialog") {
    return { ...tabInfo(tab), ok: false, dialog: pending, note: `A ${pending.type} dialog is open. Answer it with action=dialog first.` };
  }
  const needTarget = () => {
    if (!target) throw new Error(`\`target\` is required for ${action}`);
    return target;
  };
  if (!["navigate", "back", "forward", "reload", "dialog"].includes(action)) assertScriptable(tab);

  switch (action) {
    case "navigate": {
      const url = normaliseUrl(p.url);
      const loaded = waitForLoad(tabId, Math.max(timeoutMs, 15_000));
      await browser.tabs.update(tabId, { url });
      if (!(await loaded)) note = "page still loading";
      break;
    }
    case "back":
    case "forward":
    case "reload": {
      const loaded = waitForLoad(tabId, Math.max(timeoutMs, 10_000));
      if (action === "back") await browser.tabs.goBack(tabId);
      else if (action === "forward") await browser.tabs.goForward(tabId);
      else await browser.tabs.reload(tabId);
      if (!(await loaded)) note = "no navigation happened, or the page is still loading";
      break;
    }
    case "click": {
      const r = await trustedClick(tabId, needTarget(), Number(p.clickCount) || 1, p.button || "left", timeoutMs);
      note = r.note;
      dialog = r.dialog;
      break;
    }
    case "hover": {
      const t = needTarget();
      const frameId = frameOf(t);
      if (frameId === 0 && (await cdp.attach(tabId))) {
        const g = await runPage<any>(tabId, 0, "resolve", { target: t }, timeoutMs);
        await cdp.mouseMove(tabId, g.x, g.y);
      } else {
        await runPage(tabId, frameId, "hover", { target: t }, timeoutMs);
      }
      await sleep(150);
      break;
    }
    case "type": {
      const t = needTarget();
      const frameId = frameOf(t);
      const text = String(p.text ?? "");
      if (frameId === 0 && (await cdp.attach(tabId))) {
        await runPage(tabId, 0, "focus", { target: t, clear: !!p.clear }, timeoutMs);
        if (text) await cdp.insertText(tabId, text);
        if (p.submit) {
          const raced = await cdp.raceDialog(tabId, cdp.pressKey(tabId, "Enter"));
          dialog = raced.dialog;
        }
      } else {
        await runPage(tabId, frameId, "type", { target: t, text, clear: !!p.clear, submit: !!p.submit }, timeoutMs);
      }
      break;
    }
    case "press": {
      const key = String(p.key || "");
      if (!key) throw new Error("`key` is required for press");
      const frameId = frameOf(target);
      if (frameId === 0 && (await cdp.attach(tabId))) {
        if (target) await runPage(tabId, 0, "focus", { target, any: true }, timeoutMs);
        const raced = await cdp.raceDialog(tabId, cdp.pressKey(tabId, key));
        dialog = raced.dialog;
      } else {
        await runPage(tabId, frameId, "press", { target, key }, timeoutMs);
        note = "sent a synthetic key event; some pages ignore these";
      }
      break;
    }
    case "select": {
      const t = needTarget();
      const r = await runPage<any>(tabId, frameOf(t), "select", { target: t, values: p.values ?? (p.text ? [p.text] : []) }, timeoutMs);
      note = `selected ${r.selected.join(", ")}`;
      break;
    }
    case "check": {
      const t = needTarget();
      const want = p.checked !== false;
      const r = await runPage<any>(tabId, frameOf(t), "check", { target: t }, timeoutMs);
      if (r.current === want) note = `already ${want ? "checked" : "unchecked"}`;
      else {
        const c = await trustedClick(tabId, t, 1, "left", timeoutMs);
        note = c.note;
        dialog = c.dialog;
      }
      break;
    }
    case "scroll": {
      const r = await runPage<any>(tabId, frameOf(target), "scroll", { target, dx: Number(p.dx) || 0, dy: Number(p.dy) || 0 }, timeoutMs);
      note = `window scroll is now ${r.scrollX},${r.scrollY}`;
      break;
    }
    case "dialog": {
      if (!cdp.pendingDialog(tabId)) throw new Error("No dialog is open on this tab");
      await cdp.handleDialog(tabId, p.accept !== false, p.promptText);
      break;
    }
    default:
      throw new Error(`Unknown action ${action}`);
  }

  if (!dialog && !["navigate", "back", "forward", "reload"].includes(action)) {
    note = [note, await settle(tabId, timeoutMs)].filter(Boolean).join("; ") || undefined;
  }
  return { ...(await freshInfo(tabId)), ok: true, note, dialog: dialog ?? cdp.pendingDialog(tabId) };
}

async function pageEvaluate(p: Params) {
  const tab = await resolveTab(p.tabId);
  assertScriptable(tab);
  const tabId = tab.id!;
  const expression = String(p.expression ?? "");
  const timeoutMs = Math.min(Number(p.timeoutMs) || 15_000, 120_000);

  if (await cdp.attach(tabId)) {
    const run = (replMode: boolean) =>
      cdp.send<any>(tabId, "Runtime.evaluate", {
        expression, returnByValue: true, awaitPromise: true, userGesture: true, replMode, timeout: timeoutMs,
      });
    const raced = await cdp.raceDialog(tabId, withTimeout(run(false), timeoutMs + 1000, "evaluate timed out"));
    if (raced.dialog) return { ...tabInfo(tab), value: null, dialog: raced.dialog };
    let r = raced.value;
    if (r?.exceptionDetails && /await is only valid|Unexpected reserved word|SyntaxError/.test(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "")) {
      r = await withTimeout(run(true), timeoutMs + 1000, "evaluate timed out");
    }
    if (r?.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "evaluation failed");
    }
    const res = r?.result ?? {};
    const value = "value" in res ? res.value : res.type === "undefined" ? null : `[${res.subtype ?? res.type}] ${res.description ?? ""}`;
    return { ...(await freshInfo(tabId)), value };
  }

  // No debugger: eval in the page's main world. Pages with a strict CSP block this.
  const results = await withTimeout(
    browser.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (src: string) => (0, eval)(src),
      args: [expression],
    } as any),
    timeoutMs,
    "evaluate timed out",
  );
  return { ...(await freshInfo(tabId)), value: (results as any)?.[0]?.result ?? null };
}

async function pageWaitFor(p: Params) {
  const tab = await resolveTab(p.tabId);
  const tabId = tab.id!;
  const timeoutMs = Math.min(Number(p.timeoutMs) || 10_000, 120_000);
  const started = Date.now();
  if (!p.text && !p.target && !p.url) {
    await sleep(timeoutMs);
    return { ...(await freshInfo(tabId)), ok: true, note: `waited ${timeoutMs}ms` };
  }
  while (Date.now() - started < timeoutMs) {
    const info = await freshInfo(tabId);
    let ok = true;
    if (p.url) ok = String(info.url).includes(p.url) !== !!p.gone;
    if (ok && (p.text || p.target)) {
      try {
        const r = await runPage<any>(tabId, frameOf(p.target), "probe", { text: p.text, target: p.target, gone: !!p.gone }, 3000);
        ok = r.matched;
      } catch {
        ok = false; // navigating; try again
      }
    }
    if (ok) return { ...info, ok: true, note: `matched after ${Date.now() - started}ms` };
    if (cdp.pendingDialog(tabId)) return { ...info, ok: false, dialog: cdp.pendingDialog(tabId), note: "a dialog opened" };
    await sleep(150);
  }
  return { ...(await freshInfo(tabId)), ok: false, note: `condition not met within ${timeoutMs}ms` };
}

async function pageRead(p: Params) {
  const tab = await resolveTab(p.tabId);
  assertScriptable(tab);
  const r = await runPage<any>(tab.id!, frameOf(p.target), "read", { target: p.target });
  return { ...tabInfo(tab), text: r.text };
}

export const handlers: Record<string, (p: Params) => Promise<unknown>> = {
  "tabs.list": tabsList,
  "tabs.open": tabsOpen,
  "tabs.close": tabsClose,
  "tabs.focus": tabsFocus,
  "page.snapshot": pageSnapshot,
  "page.screenshot": pageScreenshot,
  "page.act": pageAct,
  "page.evaluate": pageEvaluate,
  "page.waitFor": pageWaitFor,
  "page.read": pageRead,
};
