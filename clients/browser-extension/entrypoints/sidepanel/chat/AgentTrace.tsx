import { useState } from "react";
import { Check, ChevronRight, XCircle } from "@agentic-browser/shared/icons";
import { Timeline, classifyEvent, type StepTone, type TimelineStep } from "@agentic-browser/shared/ui";
import type { AgentLoopEvent } from "./types";

// Step types the side panel writes itself (see useAgentRun). Anything else
// falls back to the shared backend-event classifier.
const LOCAL: Record<string, { kind: string; tone: StepTone }> = {
	supervisor: { kind: "plan", tone: "plan" },
	subagent: { kind: "agent", tone: "plan" },
	tool: { kind: "call", tone: "act" },
	tool_result: { kind: "result", tone: "ok" },
	browser_exec: { kind: "browser", tone: "act" },
	automation: { kind: "browser", tone: "act" },
	automation_plan: { kind: "plan", tone: "plan" },
	browser_done: { kind: "browser", tone: "ok" },
	subagent_done: { kind: "agent", tone: "plan" },
	quality: { kind: "check", tone: "ok" },
	error: { kind: "error", tone: "err" },
};

/** Collapsible log of what the agent did for one reply. */
export function AgentTrace({ events }: { events: AgentLoopEvent[] }) {
	const terminal = [...events].reverse().find((e) => e.type === "final" || e.type === "error");
	const state = !terminal ? "running" : terminal.type === "error" ? "failed" : "done";
	// Open while running; finished traces start collapsed.
	const [open, setOpen] = useState(!terminal);
	const steps = events.filter((e) => e.type !== "final");

	const timeline: TimelineStep[] = steps.map((e, i) => {
		const { kind, tone } = LOCAL[e.type] ?? classifyEvent(e.type);
		return { id: e.id || String(i), kind, tone, label: e.label, at: e.timestamp, live: state === "running" && i === steps.length - 1 };
	});

	return (
		<div className={`trace trace--${state}`}>
			<button type="button" className="trace__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
				<span className="trace__status" aria-hidden="true">
					{state === "running" ? <span className="ab-spinner" /> : state === "failed" ? <XCircle size={13} /> : <Check size={13} strokeWidth={2.5} />}
				</span>
				<span className="trace__title">{state === "running" ? steps[steps.length - 1]?.label || "Working" : terminal?.label}</span>
				<span className="trace__count">
					{steps.length} {steps.length === 1 ? "step" : "steps"}
				</span>
				<ChevronRight size={13} className="trace__chev" />
			</button>
			{open && (
				<div className="trace__body">
					<Timeline steps={timeline} dense />
				</div>
			)}
		</div>
	);
}
