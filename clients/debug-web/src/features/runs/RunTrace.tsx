import { useRunEvents } from "@agentic-browser/shared/query";
import { QueryView, Skeleton, StateView, Timeline, classifyEvent } from "@agentic-browser/shared/ui";
import { eventSummary } from "./runText";

/** Every event the run recorded, as a timeline. Payloads expand inline. */
export function RunTrace({ runId, live }: { runId: string; live: boolean }) {
  const q = useRunEvents(runId, live);
  return (
    <QueryView
      query={q}
      skeleton={
        <div style={{ display: "grid", gap: 14, padding: "8px 0 8px 24px" }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={12} width={`${70 - (i % 3) * 15}%`} />)}
        </div>
      }
      empty={<StateView title="No trace events" body="This run didn't record any steps." />}
    >
      {(events) => (
        <Timeline
          steps={events.map((ev, i) => {
            const { kind, tone } = classifyEvent(ev.event_type);
            return {
              id: ev.event_id,
              kind,
              tone,
              label: eventSummary(ev).slice(0, 180),
              at: ev.created_at,
              live: live && i === events.length - 1,
              detail: JSON.stringify(ev.payload, null, 2),
            };
          })}
        />
      )}
    </QueryView>
  );
}
