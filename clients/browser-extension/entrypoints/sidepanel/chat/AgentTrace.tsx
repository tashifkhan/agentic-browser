import { WorkLog } from "@agentic-browser/shared/ui";
import { toAgentEvents } from "./agentEvents";
import type { AgentLoopEvent } from "./types";

/** What the agent did for one reply: thinking, tool calls, notes, errors. */
export function AgentTrace({ events, live }: { events: AgentLoopEvent[]; live: boolean }) {
	return <WorkLog events={toAgentEvents(events)} live={live} compact />;
}
