import { Link } from "@tanstack/react-router";
import type { Stats } from "@agentic-browser/shared/api";
import { Card } from "@agentic-browser/shared/ui";
import { ArrowUpRight } from "@agentic-browser/shared/icons";
import { Meter, MeterTotal } from "../common/Meter";

export function RunOutcomes({ stats }: { stats: Stats }) {
  return (
    <Card title="Run outcomes">
      <Meter label="Completed" value={stats.runs.completed} total={stats.runs.total} color="var(--ok)" />
      <Meter label="Failed" value={stats.runs.failed} total={stats.runs.total} color="var(--err)" />
      <Meter label="Running" value={stats.runs.running} total={stats.runs.total} color="var(--accent)" />
      <hr className="ab-divider" style={{ margin: "10px 0" }} />
      <MeterTotal label="Conversations" value={stats.conversations} />
      <MeterTotal label="Trace events" value={stats.events} />
    </Card>
  );
}

export function MemoryTiers({ stats }: { stats: Stats }) {
  const m = stats.memory;
  return (
    <Card
      title="Memory tiers"
      actions={
        <Link to="/memory" className="ab-btn ab-btn--ghost ab-btn--sm" style={{ textDecoration: "none" }}>
          Open <ArrowUpRight size={13} />
        </Link>
      }
    >
      <Meter label="Working" value={m.working ?? 0} total={m.total_active} color="var(--accent)" />
      <Meter label="Short-term" value={m.short_term} total={m.total_active} color="var(--info)" />
      <Meter label="Long-term" value={m.long_term} total={m.total_active} color="var(--violet)" />
      <Meter label="Permanent" value={m.permanent} total={m.total_active} color="var(--warn)" />
      <hr className="ab-divider" style={{ margin: "10px 0" }} />
      <MeterTotal label="Sources ingested" value={m.sources} />
    </Card>
  );
}
