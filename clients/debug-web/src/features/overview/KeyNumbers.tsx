import type { Stats, TimeseriesBucket } from "@agentic-browser/shared/api";
import { compact } from "@agentic-browser/shared/format";
import { Stat, StatStrip } from "@agentic-browser/shared/ui";
import { SplitBar } from "../common/SplitBar";

/** The four headline numbers at the top of the overview. */
export function KeyNumbers({ stats, series }: { stats: Stats; series?: TimeseriesBucket[] }) {
  const finished = stats.runs.completed + stats.runs.failed;
  const rate = finished > 0 ? (stats.runs.completed / finished) * 100 : null;
  const perRun = stats.runs.total > 0 ? stats.tool_calls / stats.runs.total : 0;

  return (
    <StatStrip>
      <Stat
        label="Agent runs"
        value={compact(stats.runs.total)}
        sub={<span style={{ color: stats.runs.running ? "var(--accent)" : undefined }}>{stats.runs.running ? `${stats.runs.running} running now` : "none running"}</span>}
        trend={series?.map((d) => d.runs) ?? []}
        tone="var(--accent)"
      />
      <Stat
        label="Success rate"
        value={rate === null ? "-" : rate.toFixed(rate >= 99.5 || rate < 10 ? 0 : 1)}
        unit={rate === null ? undefined : "%"}
        sub={
          <>
            {stats.runs.failed > 0 ? <span className="pn-err">{stats.runs.failed} failed</span> : "no failures"} of {finished.toLocaleString()} finished
            <span className="pn-stat-split">
              <SplitBar
                parts={[
                  { label: "Completed", value: stats.runs.completed, color: "var(--ok)" },
                  { label: "Failed", value: stats.runs.failed, color: "var(--err)" },
                  { label: "Running", value: stats.runs.running, color: "var(--accent)" },
                ]}
              />
            </span>
          </>
        }
      />
      <Stat label="Tool calls" value={compact(stats.tool_calls)} sub={`${perRun.toFixed(1)} per run`} trend={series?.map((d) => d.tool_calls) ?? []} tone="var(--info)" />
      <Stat
        label="Memory"
        value={compact(stats.memory.total_active)}
        unit="claims"
        sub={
          <>
            from {stats.memory.sources.toLocaleString()} sources
            <span className="pn-stat-split">
              <SplitBar
                parts={[
                  { label: "Working", value: stats.memory.working ?? 0, color: "var(--accent)" },
                  { label: "Short-term", value: stats.memory.short_term, color: "var(--info)" },
                  { label: "Long-term", value: stats.memory.long_term, color: "var(--violet)" },
                  { label: "Permanent", value: stats.memory.permanent, color: "var(--warn)" },
                ]}
              />
            </span>
          </>
        }
      />
    </StatStrip>
  );
}
