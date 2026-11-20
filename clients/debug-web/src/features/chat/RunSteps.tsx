import { useMemo } from "react";
import { useRunEvents } from "@agentic-browser/shared/query";
import { eventToStep, type StepEvent } from "./events";
import { StepsDisclosure } from "./StepsDisclosure";

/** Steps recorded for a finished run, loaded from the run's event log. */
export function RunSteps({ runId, live }: { runId: string; live: boolean }) {
  const { data } = useRunEvents(runId, live);
  const steps = useMemo(
    () => (data ?? []).map((e) => eventToStep({ event: e.event_type, ...e.payload }, e.created_at, e.event_id)).filter(Boolean) as StepEvent[],
    [data],
  );
  return <StepsDisclosure steps={steps} live={live} />;
}
