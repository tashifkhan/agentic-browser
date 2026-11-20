// WebSocket link from the extension to the local Agentic Browser bridge
// (`agentic-mcp` or the backend, both on 127.0.0.1:5455). MCP clients such as
// Claude Code, Codex and T3 Code reach the browser through it.
//
// MV3 service workers sleep when idle. An open WebSocket with traffic every
// 20s keeps the worker alive (Chrome 116+), and an alarm wakes it to
// reconnect when the bridge was down.

import { browser } from "wxt/browser";
import { cdpAvailable } from "./cdp";
import { handlers } from "./handlers";
import { DEFAULT_BRIDGE_URL, type BridgeStatus } from "./types";

export { DEFAULT_BRIDGE_URL, type BridgeStatus };

const ALARM = "agentic-bridge-keepalive";
const PING_MS = 20_000;

let socket: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
let inflight = 0;
let status: BridgeStatus = { state: "disconnected", url: DEFAULT_BRIDGE_URL, since: Date.now(), calls: 0 };

async function settings(): Promise<{ enabled: boolean; url: string }> {
  const s = (await browser.storage.local.get(["bridgeEnabled", "bridgeUrl"])) as { bridgeEnabled?: boolean; bridgeUrl?: string };
  return { enabled: s.bridgeEnabled !== false, url: s.bridgeUrl || DEFAULT_BRIDGE_URL };
}

function setStatus(patch: Partial<BridgeStatus>) {
  const changedState = patch.state && patch.state !== status.state;
  status = { ...status, ...patch, ...(changedState ? { since: Date.now() } : {}) };
  browser.storage.local.set({ bridgeStatus: status }).catch(() => {});
}

function setBadge() {
  const action = (browser as any).action ?? (browser as any).browserAction;
  if (!action?.setBadgeText) return;
  if (inflight > 0) {
    action.setBadgeBackgroundColor?.({ color: "#7c3aed" });
    action.setBadgeText({ text: "RUN" });
  } else {
    action.setBadgeText({ text: "" });
  }
}

function browserInfo() {
  const ua = navigator.userAgent;
  const brands: { brand: string; version: string }[] = (navigator as any).userAgentData?.brands ?? [];
  const brand = brands.find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand)) ?? brands.find((b) => /Chromium/i.test(b.brand));
  if (brand) return { browser: brand.brand, version: brand.version };
  const ff = ua.match(/Firefox\/([\d.]+)/);
  if (ff) return { browser: "Firefox", version: ff[1] };
  return { browser: "Chrome", version: ua.match(/Chrome\/([\d.]+)/)?.[1] ?? "" };
}

async function handleRequest(ws: WebSocket, msg: { id: string; method: string; params: any }) {
  const handler = handlers[msg.method];
  inflight++;
  setBadge();
  setStatus({ calls: status.calls + 1, lastMethod: msg.method });
  let reply: Record<string, unknown>;
  try {
    if (!handler) throw new Error(`Unknown bridge method ${msg.method}. Update the extension.`);
    reply = { type: "response", id: msg.id, result: (await handler(msg.params ?? {})) ?? null };
  } catch (err) {
    reply = { type: "response", id: msg.id, error: { message: String((err as Error)?.message ?? err) } };
  } finally {
    inflight--;
    setTimeout(setBadge, 800);
  }
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
}

export async function connectBridge(force = false) {
  const { enabled, url } = await settings();
  if (!enabled) {
    disconnectBridge();
    setStatus({ state: "disabled", url, error: undefined });
    return;
  }
  if (!force && socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  clearTimeout(retryTimer);
  setStatus({ state: "connecting", url });

  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    setStatus({ state: "disconnected", error: String((err as Error).message) });
    scheduleRetry();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    const manifest = browser.runtime.getManifest();
    ws.send(
      JSON.stringify({
        type: "hello",
        ...browserInfo(),
        extension_version: manifest.version,
        extension_id: browser.runtime.id,
        capabilities: ["tabs", "snapshot", "act", "evaluate", "screenshot", ...(cdpAvailable() ? ["cdp"] : [])],
      }),
    );
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), PING_MS);
  };

  ws.onmessage = (event) => {
    let msg: any;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (msg.type === "welcome") {
      retryDelay = 1000;
      setStatus({ state: "connected", error: undefined });
    } else if (msg.type === "request") {
      void handleRequest(ws, msg);
    }
  };

  ws.onclose = (event) => {
    clearInterval(pingTimer);
    if (socket === ws) socket = null;
    const reason =
      event.code === 4403
        ? "Bridge rejected this extension (check AGENTIC_BROWSER_EXTENSION_IDS)"
        : "Bridge not running. Start it with `agentic-mcp serve`, or let your MCP client launch it.";
    setStatus({ state: "disconnected", error: reason });
    scheduleRetry();
  };
  ws.onerror = () => {
    /* onclose follows and handles the retry */
  };
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void connectBridge(), retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30_000);
}

export function disconnectBridge() {
  clearTimeout(retryTimer);
  clearInterval(pingTimer);
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}

export function getBridgeStatus(): BridgeStatus {
  return status;
}

export function startBridge() {
  const alarms = (browser as any).alarms;
  alarms?.create?.(ALARM, { periodInMinutes: 0.5 });
  alarms?.onAlarm?.addListener((alarm: { name: string }) => {
    if (alarm.name === ALARM) void connectBridge();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.bridgeUrl || changes.bridgeEnabled)) {
      retryDelay = 1000;
      void connectBridge(true);
    }
  });
  void connectBridge();
}
