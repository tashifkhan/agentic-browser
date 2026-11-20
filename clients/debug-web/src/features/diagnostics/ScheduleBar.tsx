import { Pill } from "@agentic-browser/shared/ui";
import { Clock3 } from "@agentic-browser/shared/icons";
import { JOBS } from "./jobs";

/** When each consolidation job runs. */
export function ScheduleBar() {
  return (
    <>
      <span className="pn-label">
        <Clock3 size={13} /> Schedule
      </span>
      {Object.entries(JOBS)
        .filter(([k]) => k !== "micro_reflection")
        .map(([k, j]) => (
          <Pill key={k} dot={false}>
            <span className="pn-swatch" style={{ background: j.color, width: 6, height: 6, marginRight: 2 }} />
            {j.label.toLowerCase()}, {j.when}
          </Pill>
        ))}
    </>
  );
}
