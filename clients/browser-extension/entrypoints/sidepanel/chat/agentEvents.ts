import { describeEvent, type AgentEvent } from "@agentic-browser/shared/agent";
import type { AgentLoopEvent } from "./types";

/** Saved reply events -> the shared AgentEvent shape the work log reads. */
export const toAgentEvents = (events: AgentLoopEvent[]): AgentEvent[] =>
	events.map((e) => ({ ...(e.data ?? {}), event: e.type, at: e.timestamp, id: e.id, label: e.label }));

/** Shared AgentEvent -> the shape saved with a chat (label kept for older readers). */
export function fromAgentEvent(e: AgentEvent): AgentLoopEvent {
	const { event, at, id, label, ...data } = e;
	return {
		id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		type: event,
		label: typeof label === "string" ? label : describeEvent(e) ?? event,
		timestamp: at,
		data: Object.keys(data).length ? data : undefined,
	};
}
