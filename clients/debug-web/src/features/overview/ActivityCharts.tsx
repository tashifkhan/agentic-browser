import { useEffect, useState } from "react";
import { useTimeseries } from "@agentic-browser/shared/query";
import { Card, QueryView, Segmented, Skeleton, StateView } from "@agentic-browser/shared/ui";
import { DailyChart } from "./DailyChart";

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

const CHARTS = [
  { field: "runs", kind: "bars", color: "var(--accent)", title: "Runs per day", label: "Runs" },
  { field: "tool_calls", kind: "area", color: "var(--info)", title: "Tool calls per day", label: "Tool calls" },
] as const;

function useRange() {
  const [range, setRange] = useState<Range>(() => {
    const saved = Number(localStorage.getItem("overview-range"));
    return (RANGES as readonly number[]).includes(saved) ? (saved as Range) : 14;
  });
  useEffect(() => localStorage.setItem("overview-range", String(range)), [range]);
  return [range, setRange] as const;
}

/** Daily runs and tool calls, with a 7/14/30 day switch. */
export function ActivityCharts() {
  const [range, setRange] = useRange();
  // Always fetch 30 days so switching range is instant; slice locally.
  const q = useTimeseries(30);

  return (
    <section>
      <div className="pn-section-head">
        <h2>Activity</h2>
        <Segmented
          label="Time range"
          size="sm"
          value={String(range)}
          onChange={(v) => setRange(Number(v) as Range)}
          options={RANGES.map((d) => ({ value: String(d), label: `${d} days` }))}
        />
      </div>
      <div className="pn-grid-2">
        {CHARTS.map((c) => (
          <Card
            key={c.field}
            title={c.title}
            actions={
              <span className="pn-legend">
                <span><i style={{ background: c.color }} />{c.label}</span>
              </span>
            }
          >
            <QueryView
              query={q}
              skeleton={<Skeleton height={176} />}
              empty={<StateView title="No activity yet" body="Runs show up here once the agent starts working." style={{ height: 176, padding: 0 }} />}
            >
              {(data) => <DailyChart data={data.slice(-range)} field={c.field} kind={c.kind} color={c.color} label={c.label} />}
            </QueryView>
          </Card>
        ))}
      </div>
    </section>
  );
}
