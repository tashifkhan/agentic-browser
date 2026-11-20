// Agent run events -> a work log both clients render the same way.
//
// The backend streams events (see agents/react_agent.py astream_react_agent
// and the supervisor/automation harness). Clients keep them as a flat list of
// AgentEvent, merged with `appendEvent` so streamed thinking is one entry per
// model step, and turn that list into a WorkLog with `buildWorkLog`.

export type AgentEvent = {
  /** Backend event name: thinking_delta, subagent_tool_call, error, ... */
  event: string;
  /** ISO time the client received it (live) or the server stored it. */
  at: string;
  id?: string;
  /** Pre-rendered label, for events stored before payloads were kept. */
  label?: string;
  [key: string]: unknown;
};

export type ThinkingItem = { kind: "thinking"; id: string; step: number; text: string; startedAt: string; endedAt?: string };
export type ToolItem = {
  kind: "tool";
  id: string;
  callId?: string;
  tool: string;
  summary: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  status: "running" | "ok" | "error";
  startedAt: string;
  endedAt?: string;
};
export type NoteItem = { kind: "note"; id: string; text: string; at: string; tone?: "plan" | "act" | "ok" };
export type ErrorItem = { kind: "error"; id: string; text: string; at: string };
export type WorkItem = ThinkingItem | ToolItem | NoteItem | ErrorItem;

export type WorkLog = {
  items: WorkItem[];
  status: "running" | "done" | "failed";
  startedAt?: string;
  endedAt?: string;
  toolCount: number;
};

const TOOL_NAMES: Record<string, string> = {
  recall_memory: "Searched memory",
  write_memory: "Saved to memory",
  recall_document_facts: "Searched documents",
  browser_action_agent: "Used the browser",
  browser_action_executor: "Browser action",
  google_search_agent: "Searched the web",
  websearch_agent: "Searched the web",
  gmail_agent: "Checked Gmail",
  calendar_agent: "Checked the calendar",
  youtube_agent: "Read a YouTube video",
  github_agent: "Read a GitHub repo",
  website_agent: "Read a web page",
};

/** "Searched memory" for known tools, otherwise "web_fetch" -> "Web fetch". */
export function toolTitle(tool: string): string {
  return TOOL_NAMES[tool] ?? tool.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** The most telling argument, shortened: query, url, task, or the first string. */
export function toolSummary(args: unknown, max = 72): string {
  if (args == null) return "";
  if (typeof args === "string") return clip(args, max);
  if (typeof args !== "object") return String(args);
  const a = args as Record<string, unknown>;
  for (const key of ["query", "q", "url", "task", "question", "content", "goal", "prompt"]) {
    if (typeof a[key] === "string" && a[key]) return clip(a[key] as string, max);
  }
  const first = Object.values(a).find((v) => typeof v === "string" && v);
  return first ? clip(first as string, max) : "";
}

const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** One readable line for events that aren't thinking or tool calls. */
export function describeEvent(d: Record<string, any>): string | null {
  switch (d.event) {
    case "automation_started": return "Started browser automation";
    case "automation_plan": return d.done ? "Automation complete" : `Planned ${(d.actions || []).length || "the next"} browser action${(d.actions || []).length === 1 ? "" : "s"}`;
    case "automation_execute": return `Ran ${(d.actions || []).length} browser action${(d.actions || []).length === 1 ? "" : "s"}`;
    case "automation_observation": {
      const failed = (d.results || []).find((r: any) => !r.success);
      return failed ? `Action failed: ${failed.error || "unknown"}` : "Checked the page after acting";
    }
    case "automation_replan": return `Replanning: ${d.reason || "the last action failed"}`;
    case "supervisor_iteration": return `Plan ${d.iteration || ""}: ${d.action || "delegate"}${d.selected_subagent ? ` to ${d.selected_subagent}` : ""}`.replace(/\s+/g, " ");
    case "subagent_started": return d.subagent && d.subagent !== "react" ? `Handed to ${d.subagent}: ${clip(String(d.task || ""), 90)}` : null;
    case "quality_check": return `Checked the answer: ${d.satisfactory ? "good" : "needs work"}${d.feedback ? `, ${clip(String(d.feedback), 80)}` : ""}`;
    case "subagent_tool_call": return `${toolTitle(String(d.tool || "tool"))}${toolSummary(d.args) ? `: ${toolSummary(d.args)}` : ""}`;
    case "subagent_tool_result": return `${toolTitle(String(d.tool || "tool"))} finished`;
    case "subagent_tool_error": return `${toolTitle(String(d.tool || "tool"))} failed: ${d.error || "unknown"}`;
    case "final": return d.status === "blocked" ? "Stopped and asked for help" : "Answered";
    case "error": return `Error: ${d.message || "unknown"}`;
    default: return null;
  }
}

/**
 * Add a streamed event to a list. Thinking deltas for the same step merge
 * into one entry and answer deltas are dropped (the answer lives on the
 * message), so the list stays small enough to store with a chat.
 */
export function appendEvent(list: AgentEvent[], evt: AgentEvent): AgentEvent[] {
  if (evt.event === "answer_delta" || evt.event === "conversation") return list;
  if (evt.event === "thinking_delta") {
    const last = list[list.length - 1];
    if (last && last.event === "thinking_delta" && last.step === evt.step) {
      return [...list.slice(0, -1), { ...last, delta: `${last.delta ?? ""}${evt.delta ?? ""}`, lastAt: evt.at }];
    }
    return [...list, { ...evt, lastAt: evt.at }];
  }
  if (evt.event === "thinking") {
    // The whole block replaces its streamed pieces.
    const idx = findLastIndex(list, (e) => e.event === "thinking_delta" && e.step === evt.step);
    if (idx >= 0) {
      const next = list.slice();
      next[idx] = { ...evt, at: list[idx].at, lastAt: evt.at };
      return next;
    }
  }
  return [...list, evt];
}

function findLastIndex<T>(list: T[], pred: (t: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) return i;
  return -1;
}

const LEGACY_TONE: Record<string, NoteItem["tone"]> = {
  tool: "act", browser_exec: "act", automation: "act", tool_result: "ok", browser_done: "ok", quality: "ok",
};

/** Turn the event list into the work log. Pure, cheap enough to run per render. */
export function buildWorkLog(events: AgentEvent[], live: boolean): WorkLog {
  const items: WorkItem[] = [];
  let failed = false;
  let finished = false;
  const openThinking = () => findLastIndex(items, (i) => i.kind === "thinking" && !i.endedAt);
  const closeThinking = (at: string) => {
    const idx = openThinking();
    if (idx >= 0) items[idx] = { ...(items[idx] as ThinkingItem), endedAt: at };
  };

  events.forEach((e, n) => {
    const id = e.id ?? `${e.event}-${n}`;
    switch (e.event) {
      case "thinking_delta":
      case "thinking": {
        const text = String(e.event === "thinking" ? e.text ?? "" : e.delta ?? "");
        if (!text.trim()) break;
        const ended = e.event === "thinking" ? String(e.lastAt ?? e.at) : undefined;
        items.push({ kind: "thinking", id, step: Number(e.step ?? 0), text, startedAt: e.at, endedAt: ended });
        break;
      }
      case "subagent_tool_call": {
        closeThinking(e.at);
        const tool = String(e.tool ?? "tool");
        items.push({
          kind: "tool", id, callId: e.call_id as string | undefined, tool, summary: toolSummary(e.args),
          args: e.args, status: "running", startedAt: e.at,
        });
        break;
      }
      case "subagent_tool_result":
      case "subagent_tool_error": {
        const tool = String(e.tool ?? "tool");
        const idx = findLastIndex(items, (i) => i.kind === "tool" && i.status === "running" && (e.call_id ? i.callId === e.call_id : i.tool === tool));
        const error = e.event === "subagent_tool_error" ? String(e.error ?? "failed") : undefined;
        if (idx >= 0) {
          const t = items[idx] as ToolItem;
          items[idx] = { ...t, status: error ? "error" : "ok", result: e.result, error, endedAt: e.at };
        } else {
          items.push({ kind: "tool", id, tool, summary: "", status: error ? "error" : "ok", result: e.result, error, startedAt: e.at, endedAt: e.at });
        }
        break;
      }
      case "answer_delta":
        // Answer text started: any open thinking block is done.
        closeThinking(e.at);
        break;
      case "error":
        failed = true;
        closeThinking(e.at);
        items.push({ kind: "error", id, text: String(e.message ?? e.label ?? "Something went wrong"), at: e.at });
        break;
      case "final":
      case "run_finished":
        finished = true;
        closeThinking(e.at);
        break;
      case "subagent_completed":
      case "run_started":
        break;
      default: {
        const text = describeEvent(e) ?? (typeof e.label === "string" ? e.label : null);
        if (!text) break;
        if (e.event.includes("error") || text.startsWith("Error")) {
          items.push({ kind: "error", id, text, at: e.at });
          failed = true;
        } else {
          items.push({ kind: "note", id, text, at: e.at, tone: LEGACY_TONE[e.event] ?? (e.event.startsWith("automation") ? "act" : "plan") });
        }
      }
    }
  });

  const startedAt = events[0]?.at;
  const last = events[events.length - 1];
  const done = !live || finished || failed;
  if (done) {
    // Anything still marked running when the run ended never reported back.
    const end = String(last?.lastAt ?? last?.at ?? "");
    items.forEach((it, i) => {
      if (it.kind === "thinking" && !it.endedAt) items[i] = { ...it, endedAt: end };
      if (it.kind === "tool" && it.status === "running") items[i] = { ...it, status: failed ? "error" : "ok", endedAt: end };
    });
  }
  return {
    items,
    status: failed ? "failed" : done ? "done" : "running",
    startedAt,
    endedAt: done ? String(last?.lastAt ?? last?.at ?? "") : undefined,
    toolCount: items.filter((i) => i.kind === "tool").length,
  };
}

/** "3s", "1m 04s". */
export function formatSpan(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export const spanBetween = (a?: string, b?: string) => (a && b ? new Date(b).getTime() - new Date(a).getTime() : NaN);
