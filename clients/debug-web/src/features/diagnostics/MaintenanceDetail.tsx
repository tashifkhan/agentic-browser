import type { MaintenanceRun } from "@agentic-browser/shared/api";
import { Card, Stat, StatStrip, StatusPill, Timeline, type TimelineStep } from "@agentic-browser/shared/ui";
import { formatDuration, fullTime, timeAgo } from "@agentic-browser/shared/format";
import { jobDuration, jobOf } from "./jobs";

function pipeline(run: MaintenanceRun): TimelineStep[] {
  const failed = run.status === "failed";
  const running = run.status === "running";
  const n = (v: number | null) => (v ?? 0).toLocaleString();
  return [
    { id: "start", kind: "start", tone: "act", at: run.started_at ?? undefined, label: "Job started" },
    { id: "review", kind: "review", tone: "plan", label: `${n(run.claims_reviewed)} claims checked for staleness, conflicts and promotion` },
    { id: "update", kind: "update", tone: "ok", label: `${n(run.claims_updated)} claims rescored or moved to a longer tier` },
    { id: "archive", kind: "archive", tone: "plan", label: `${n(run.claims_archived)} claims archived as outdated or low value` },
    {
      id: "end",
      kind: failed ? "error" : running ? "running" : "done",
      tone: failed ? "err" : running ? "act" : "ok",
      live: running,
      at: run.finished_at ?? undefined,
      label: failed ? "Job failed" : running ? "Still running" : `Finished in ${formatDuration(jobDuration(run))}`,
    },
  ];
}

export function MaintenanceDetail({ run }: { run: MaintenanceRun }) {
  const j = jobOf(run);
  return (
    <div className="pn ab-stagger">
      <header>
        <div className="pn-detail-title">
          <span className="pn-swatch" style={{ background: j.color, width: 10, height: 10, borderRadius: 3 }} />
          <h2>{j.label} maintenance</h2>
          <StatusPill status={run.status} />
        </div>
        <div className="pn-detail-meta">
          <span className="pn-dim">{run.run_id}</span>
          <span className="pn-dim" title={fullTime(run.started_at)}>started {timeAgo(run.started_at)}</span>
          {j.when && <span className="pn-dim">runs {j.when}</span>}
        </div>
      </header>
      <div className="stat-strip--compact">
        <StatStrip>
          <Stat label="Reviewed" value={(run.claims_reviewed ?? 0).toLocaleString()} />
          <Stat label="Updated" value={(run.claims_updated ?? 0).toLocaleString()} />
          <Stat label="Archived" value={(run.claims_archived ?? 0).toLocaleString()} />
          <Stat label="Duration" value={formatDuration(jobDuration(run))} />
        </StatStrip>
      </div>
      <Card title="Pipeline">
        <Timeline steps={pipeline(run)} />
      </Card>
    </div>
  );
}
