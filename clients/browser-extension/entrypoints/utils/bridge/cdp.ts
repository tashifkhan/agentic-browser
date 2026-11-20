// chrome.debugger (CDP) access for trusted input, evaluate and screenshots.
// Attaching shows Chrome's "started debugging this browser" bar, so sessions
// are opened lazily and dropped after a short idle period.

import { browser } from "wxt/browser";

const IDLE_DETACH_MS = 90_000;

export type DialogInfo = { type: string; message: string; defaultPrompt?: string; url?: string };

type Session = { idleTimer?: ReturnType<typeof setTimeout> };

const sessions = new Map<number, Session>();
const dialogs = new Map<number, DialogInfo>();
const dialogWaiters = new Map<number, Set<(d: DialogInfo) => void>>();

// chrome.debugger has no `browser.*` polyfill typing in WXT, and does not exist
// in Firefox, so use the global chrome namespace when present.
type Debuggee = { tabId?: number };
type DebuggerApi = {
  attach(target: Debuggee, version: string): Promise<void>;
  detach(target: Debuggee): Promise<void>;
  sendCommand(target: Debuggee, method: string, params?: object): Promise<unknown>;
  onEvent: { addListener(fn: (source: Debuggee, method: string, params?: unknown) => void): void };
  onDetach: { addListener(fn: (source: Debuggee, reason: string) => void): void };
};
const dbg: DebuggerApi | undefined = (globalThis as any).chrome?.debugger;

export const cdpAvailable = () => !!dbg;

let listenersInstalled = false;
function installListeners() {
  if (listenersInstalled || !dbg) return;
  listenersInstalled = true;
  dbg.onEvent.addListener((source, method, params: any) => {
    const tabId = source.tabId;
    if (tabId == null) return;
    if (method === "Page.javascriptDialogOpening") {
      const info: DialogInfo = {
        type: params.type,
        message: params.message,
        defaultPrompt: params.defaultPrompt,
        url: params.url,
      };
      dialogs.set(tabId, info);
      dialogWaiters.get(tabId)?.forEach((fn) => fn(info));
    } else if (method === "Page.javascriptDialogClosed") {
      dialogs.delete(tabId);
    }
  });
  dbg.onDetach.addListener((source) => {
    if (source.tabId != null) {
      sessions.delete(source.tabId);
      dialogs.delete(source.tabId);
    }
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    sessions.delete(tabId);
    dialogs.delete(tabId);
  });
}

function touch(tabId: number) {
  const s = sessions.get(tabId);
  if (!s) return;
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => detach(tabId), IDLE_DETACH_MS);
}

export async function attach(tabId: number): Promise<boolean> {
  if (!dbg) return false;
  installListeners();
  if (sessions.has(tabId)) {
    touch(tabId);
    return true;
  }
  try {
    await dbg.attach({ tabId }, "1.3");
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (!/already attached/i.test(msg)) return false;
  }
  sessions.set(tabId, {});
  touch(tabId);
  try {
    // Page events report alert/confirm/prompt dialogs.
    await dbg.sendCommand({ tabId }, "Page.enable");
  } catch {
    /* some targets reject Page.enable; dialogs then go unreported */
  }
  return true;
}

export async function detach(tabId: number) {
  const s = sessions.get(tabId);
  if (s?.idleTimer) clearTimeout(s.idleTimer);
  sessions.delete(tabId);
  if (!dbg) return;
  try {
    await dbg.detach({ tabId });
  } catch {
    /* already gone */
  }
}

export async function send<T = any>(tabId: number, method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!dbg) throw new Error("chrome.debugger is unavailable in this browser");
  if (!sessions.has(tabId) && !(await attach(tabId))) {
    throw new Error("Could not attach the debugger to this tab (DevTools open, or a browser-internal page)");
  }
  touch(tabId);
  return (await dbg.sendCommand({ tabId }, method, params)) as T;
}

export function pendingDialog(tabId: number): DialogInfo | undefined {
  return dialogs.get(tabId);
}

/** Resolve with dialog info if a JS dialog opens before `promise` settles. */
export async function raceDialog<T>(tabId: number, promise: Promise<T>): Promise<{ value?: T; dialog?: DialogInfo }> {
  let off: () => void = () => {};
  const dialogPromise = new Promise<{ dialog: DialogInfo }>((resolve) => {
    const fn = (d: DialogInfo) => resolve({ dialog: d });
    let set = dialogWaiters.get(tabId);
    if (!set) dialogWaiters.set(tabId, (set = new Set()));
    set.add(fn);
    off = () => set!.delete(fn);
  });
  try {
    return await Promise.race([promise.then((value) => ({ value })), dialogPromise]);
  } finally {
    off();
  }
}

export async function handleDialog(tabId: number, accept: boolean, promptText?: string) {
  await send(tabId, "Page.handleJavaScriptDialog", { accept, promptText });
  dialogs.delete(tabId);
}

// ── input helpers ───────────────────────────────────────────────────────────

const BUTTON_MASK: Record<string, number> = { left: 1, right: 2, middle: 4 };

export async function mouseClick(tabId: number, x: number, y: number, button = "left", clickCount = 1) {
  await send(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (let i = 1; i <= clickCount; i++) {
    const common = { x, y, button, clickCount: i };
    await send(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", buttons: BUTTON_MASK[button] ?? 1, ...common });
    await send(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", buttons: 0, ...common });
  }
}

export async function mouseMove(tabId: number, x: number, y: number) {
  await send(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
}

export async function mouseWheel(tabId: number, x: number, y: number, deltaX: number, deltaY: number) {
  await send(tabId, "Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX, deltaY });
}

export async function insertText(tabId: number, text: string) {
  await send(tabId, "Input.insertText", { text });
}

// ── keys ────────────────────────────────────────────────────────────────────

type KeyDef = { key: string; code: string; keyCode: number; text?: string };

const NAMED_KEYS: Record<string, KeyDef> = {
  enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  tab: { key: "Tab", code: "Tab", keyCode: 9 },
  escape: { key: "Escape", code: "Escape", keyCode: 27 },
  esc: { key: "Escape", code: "Escape", keyCode: 27 },
  backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  delete: { key: "Delete", code: "Delete", keyCode: 46 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  home: { key: "Home", code: "Home", keyCode: 36 },
  end: { key: "End", code: "End", keyCode: 35 },
  pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
  pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 },
  space: { key: " ", code: "Space", keyCode: 32, text: " " },
  " ": { key: " ", code: "Space", keyCode: 32, text: " " },
};
for (let i = 1; i <= 12; i++) NAMED_KEYS[`f${i}`] = { key: `F${i}`, code: `F${i}`, keyCode: 111 + i };

const MODIFIERS: Record<string, number> = { alt: 1, option: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, command: 4, shift: 8 };
const MAC_COMMANDS: Record<string, string> = { a: "selectAll", c: "copy", v: "paste", x: "cut", z: "undo" };

const isMac = () => /Mac/i.test((navigator as any).userAgentData?.platform || navigator.userAgent);

function keyDef(name: string): KeyDef {
  const named = NAMED_KEYS[name.toLowerCase()];
  if (named) return named;
  if (name.length === 1) {
    const upper = name.toUpperCase();
    const code = /[a-z]/i.test(name) ? `Key${upper}` : /\d/.test(name) ? `Digit${name}` : "";
    return { key: name, code, keyCode: upper.charCodeAt(0), text: name };
  }
  throw new Error(`Unknown key "${name}". Use names like Enter, Tab, Escape, ArrowDown, or one character.`);
}

/** Press a chord such as "Enter", "Shift+Tab" or "Mod+a" (Mod = Cmd on macOS, else Ctrl). */
export async function pressKey(tabId: number, chord: string) {
  const parts = chord.split("+").filter(Boolean);
  const last = parts.pop() ?? chord;
  let modifiers = 0;
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === "mod") modifiers |= isMac() ? 4 : 2;
    else if (MODIFIERS[lower]) modifiers |= MODIFIERS[lower];
    else throw new Error(`Unknown modifier "${p}"`);
  }
  const def = keyDef(last);
  const shortcut = (modifiers & (2 | 4)) !== 0;
  const text = shortcut ? undefined : modifiers & 8 && def.text ? def.text.toUpperCase() : def.text;
  const commands = shortcut && isMac() && MAC_COMMANDS[def.key.toLowerCase()] ? [MAC_COMMANDS[def.key.toLowerCase()]] : undefined;
  const base = { key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode, nativeVirtualKeyCode: def.keyCode, modifiers };
  await send(tabId, "Input.dispatchKeyEvent", {
    type: text ? "keyDown" : "rawKeyDown",
    ...base,
    text,
    unmodifiedText: text,
    commands,
  });
  await send(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
}
