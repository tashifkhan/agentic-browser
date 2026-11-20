import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useQueries, useRuns } from "@agentic-browser/shared/query";
import { Card, QueryView, Skeleton, StateView, StatusPill } from "@agentic-browser/shared/ui";
import { Activity, ArrowUpRight, ChevronRight } from "@agentic-browser/shared/icons";
import { formatDuration, fullTime, timeAgo } from "@agentic-browser/shared/format";
import { runSummary } from "../runs/runText";

/** The six newest runs, linking into run detail (prefetched on hover). */
export function RecentRuns() {
  const q = useRuns({ limit: 6 });
  const queries = useQueries();
  const client = useQueryClient();

  return (
    <Card
      title="Latest runs"
      padded={false}
      actions={
        <Link to="/runs" className="ab-btn ab-btn--ghost ab-btn--sm" style={{ textDecoration: "none" }}>
          All runs <ArrowUpRight size={13} />
        </Link>
      }
    >
      <div style={{ padding: 8 }}>
        <QueryView
          query={q}
          skeleton={
            <div style={{ display: "grid", gap: 12, padding: 10 }}>
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={14} />)}
            </div>
          }
          empty={<StateView icon={<Activity size={18} />} title="No runs yet" body="Ask the agent something in Chat or the extension and it shows up here." style={{ padding: "22px 10px" }} />}
        >
          {(runs) =>
            runs.map((r) => (
              <Link
                key={r.run_id}
                to="/runs/$runId"
                params={{ runId: r.run_id }}
                className="pn-row"
                onMouseEnter={() => client.prefetchQuery(queries.run(r.run_id))}
                style={{ gridTemplateColumns: "88px minmax(0,1fr) auto 14px", minHeight: 40, borderRadius: "var(--r-2)", borderBottom: 0, padding: "0 10px" }}
              >
                <StatusPill status={r.status} />
                <span className="pn-clip" style={{ color: r.error ? "var(--err)" : "var(--text-2)", fontSize: 12.5 }}>
                  {runSummary(r) || r.entrypoint}
                </span>
                <span className="pn-dim" title={fullTime(r.started_at)}>
                  {r.status === "running" ? timeAgo(r.started_at) : formatDuration(r.duration_s)}
                </span>
                <ChevronRight size={14} className="pn-row__go" />
              </Link>
            ))
          }
        </QueryView>
      </div>
    </Card>
  );
}
