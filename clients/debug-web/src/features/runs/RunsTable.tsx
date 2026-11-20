import { useQueryClient } from "@tanstack/react-query";
import type { Run } from "@agentic-browser/shared/api";
import { useQueries } from "@agentic-browser/shared/query";
import { StatusPill } from "@agentic-browser/shared/ui";
import { fullTime, timeAgo } from "@agentic-browser/shared/format";
import { DataTable, TableSkeleton, type Column } from "../common/DataTable";
import { LiveDuration } from "../common/LiveDuration";
import { runSummary, shortId } from "./runText";

const COLUMNS: Column<Run>[] = [
  { key: "status", header: "Status", width: "104px", render: (r) => <StatusPill status={r.status} /> },
  {
    key: "run",
    header: "Run",
    width: "minmax(150px, 0.9fr)",
    render: (r) => (
      <span className="pn-stack">
        <span className="pn-id pn-clip">{shortId(r.run_id)}</span>
        <span className="pn-sub pn-clip">{r.entrypoint}</span>
      </span>
    ),
  },
  {
    key: "answer",
    header: "Answer",
    width: "minmax(0, 2.2fr)",
    render: (r) => {
      const text = runSummary(r);
      return (
        <span className={`pn-clip${r.error ? " pn-err" : ""}`} style={{ fontSize: 13 }} title={text}>
          {text || <span style={{ color: "var(--text-4)" }}>{r.status === "running" ? "Working…" : "No answer recorded"}</span>}
        </span>
      );
    },
  },
  {
    key: "time",
    header: "Time",
    width: "76px",
    align: "end",
    render: (r) => <span className="pn-num"><LiveDuration startedAt={r.started_at} status={r.status} durationS={r.duration_s} /></span>,
  },
  {
    key: "started",
    header: "Started",
    width: "84px",
    align: "end",
    render: (r) => <span className="pn-dim" title={fullTime(r.started_at)}>{timeAgo(r.started_at)}</span>,
  },
];

/** Runs as rows; hovering a row prefetches its detail so opening it is instant. */
export function RunsTable({ runs }: { runs: Run[] }) {
  const queries = useQueries();
  const client = useQueryClient();
  return (
    <DataTable
      label="Agent runs"
      columns={COLUMNS}
      rows={runs}
      rowKey={(r) => r.run_id}
      link={(r) => ({ to: "/runs/$runId", params: { runId: r.run_id } })}
      onRowHover={(r) => client.prefetchQuery(queries.run(r.run_id))}
    />
  );
}

export function RunsTableSkeleton() {
  return <TableSkeleton columns={COLUMNS} />;
}
