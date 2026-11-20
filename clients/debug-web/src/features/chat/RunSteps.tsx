import { useMemo } from "react";
import type { AgentEvent } from "@agentic-browser/shared/agent";
import { useRunEvents } from "@agentic-browser/shared/query";
import { WorkLog } from "@agentic-browser/shared/ui";

/** The work log of a stored run, rebuilt from its event log. */
export function RunSteps({ runId, live }: { runId: string; live: boolean }) {
  const { data } = useRunEvents(runId, live);
  const events = useMemo<AgentEvent[]>(
    () => (data ?? []).map((e) => ({ ...(e.payload ?? {}), event: e.event_type, at: e.created_at, id: e.event_id })),
    [data],
  );
  if (!events.length) return null;
  return <WorkLog events={events} live={live} />;
}
