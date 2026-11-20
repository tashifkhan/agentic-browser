import type { MaintenanceRun } from "@agentic-browser/shared/api";
import { StatusPill } from "@agentic-browser/shared/ui";
import { formatDuration, fullTime, timeAgo } from "@agentic-browser/shared/format";
import { DataTable, TableSkeleton, type Column } from "../common/DataTable";
import { jobDuration, jobOf } from "./jobs";

function Count({ value, of, color }: { value: number | null; of?: number | null; color: string }) {
  const v = value ?? 0;
  const pct = of && of > 0 ? Math.min(100, (v / of) * 100) : 0;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <span className="pn-num" style={{ color: v === 0 ? "var(--text-4)" : undefined }}>{v.toLocaleString()}</span>
      {of !== undefined && (
        <span style={{ width: 44, height: 3, borderRadius: 2, background: "var(--hover)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${pct}%`, background: color }} />
        </span>
      )}
    </span>
  );
}

const COLUMNS: Column<MaintenanceRun>[] = [
  {
    key: "job",
    header: "Job",
    width: "minmax(180px, 1.6fr)",
    render: (r) => {
      const j = jobOf(r);
      return (
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="pn-swatch" style={{ background: j.color }} />
          <span className="pn-stack">
            <span className="pn-clip" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{j.label}</span>
            <span className="pn-sub pn-clip ab-mono" style={{ fontSize: 11 }}>{r.run_id.slice(0, 14)}</span>
          </span>
        </span>
      );
    },
  },
  { key: "status", header: "Status", width: "104px", render: (r) => <StatusPill status={r.status} /> },
  { key: "reviewed", header: "Reviewed", width: "minmax(72px, 0.5fr)", align: "end", render: (r) => <Count value={r.claims_reviewed} color="var(--info)" /> },
  { key: "updated", header: "Updated", width: "minmax(72px, 0.5fr)", align: "end", render: (r) => <Count value={r.claims_updated} of={r.claims_reviewed} color="var(--info)" /> },
  { key: "archived", header: "Archived", width: "minmax(72px, 0.5fr)", align: "end", render: (r) => <Count value={r.claims_archived} of={r.claims_reviewed} color="var(--warn)" /> },
  { key: "time", header: "Time", width: "76px", align: "end", render: (r) => <span className="pn-num">{formatDuration(jobDuration(r))}</span> },
  { key: "started", header: "Started", width: "84px", align: "end", render: (r) => <span className="pn-dim" title={fullTime(r.started_at)}>{timeAgo(r.started_at)}</span> },
];

export function MaintenanceTable({ runs }: { runs: MaintenanceRun[] }) {
  return (
    <DataTable
      label="Maintenance runs"
      columns={COLUMNS}
      rows={runs}
      rowKey={(r) => r.run_id}
      link={(r) => ({ to: "/diagnostics/$runId", params: { runId: r.run_id } })}
    />
  );
}

export function MaintenanceTableSkeleton() {
  return <TableSkeleton columns={COLUMNS} rows={6} />;
}
