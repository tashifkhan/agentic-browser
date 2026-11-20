import { classifyEvent, type TimelineStep } from "@agentic-browser/shared/ui";

export type StepEvent = { id: string; type: string; label: string; at: string; detail?: string };

function firstArg(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const [key, value] = Object.entries(args as Record<string, unknown>)[0] ?? [];
  if (!key) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return ` ${key}: ${text.length > 48 ? `${text.slice(0, 48)}…` : text}`;
}

/**
 * One readable line for an agent event. Works for both live stream events
 * and the events stored with a run, since they share the same payload.
 */
export function describeEvent(d: Record<string, any>): string | null {
  switch (d.event) {
    case "run_started": return "Run started";
    case "automation_started": return "Started browser automation";
    case "automation_plan": return d.done ? "Automation complete" : `Planned ${(d.actions || []).length || "the next"} browser action`;
    case "automation_execute": return `Ran ${(d.actions || []).length} browser action(s)`;
    case "automation_observation": {
      const failed = (d.results || []).find((r: any) => !r.success);
      return failed ? `Action failed: ${failed.error || "unknown"}` : "Checked the page after acting";
    }
    case "automation_replan": return `Replanning: ${d.reason || "the last action failed"}`;
    case "supervisor_iteration": return `Plan ${d.iteration || ""}: ${d.action || "delegate"}${d.selected_subagent ? ` to ${d.selected_subagent}` : ""}`.trim();
    case "subagent_started": return `${d.subagent || "Sub-agent"} started: ${String(d.task || "").slice(0, 100)}`;
    case "subagent_tool_call": return `${d.tool || "tool"}${firstArg(d.args)}`;
    case "subagent_tool_result": return `${d.tool || "tool"} returned`;
    case "subagent_tool_error": return `${d.tool || "tool"} failed: ${d.error || "unknown"}`;
    case "subagent_completed": return `${d.subagent || "Sub-agent"} finished`;
    case "quality_check": return `Quality ${d.score != null ? d.score : ""} ${d.satisfactory ? "passed" : "needs work"}${d.feedback ? `: ${d.feedback}` : ""}`.replace(/\s+/g, " ");
    case "run_finished": return "Run finished";
    case "final": return d.status === "blocked" ? "Stopped and asked for help" : `Answered${d.iterations ? ` after ${d.iterations} loop${d.iterations === 1 ? "" : "s"}` : ""}`;
    case "error": return `Error: ${d.message || "unknown"}`;
    default: return null;
  }
}

/** Raw payload for the expandable detail, minus fields already in the label. */
function detailOf(d: Record<string, any>): string | undefined {
  const { event: _e, subagent: _s, ...rest } = d;
  if (rest.args || rest.result || rest.error) return JSON.stringify(rest.args ?? rest.result ?? rest.error, null, 2);
  return undefined;
}

export function eventToStep(d: Record<string, any>, at: string, id: string): StepEvent | null {
  const label = describeEvent(d);
  return label ? { id, type: String(d.event), label, at, detail: detailOf(d) } : null;
}

export function toTimeline(events: StepEvent[], live: boolean): TimelineStep[] {
  return events.map((e, i) => {
    const { kind, tone } = classifyEvent(e.type);
    return {
      id: e.id,
      kind,
      tone,
      label: e.label,
      at: e.at,
      live: live && i === events.length - 1,
      detail: e.detail ? <pre style={{ margin: 0, font: "inherit" }}>{e.detail}</pre> : undefined,
    };
  });
}
