import { Link } from "@tanstack/react-router";
import type { RunDetail } from "@agentic-browser/shared/api";
import { Stat, StatStrip, StatusPill } from "@agentic-browser/shared/ui";
import { ChevronRight } from "@agentic-browser/shared/icons";
import { fullTime, timeAgo } from "@agentic-browser/shared/format";
import { CopyText } from "../common/CopyText";
import { LiveDuration } from "../common/LiveDuration";

export function RunHeader({ run }: { run: RunDetail }) {
  const toolErrors = run.tool_calls?.filter((t) => t.error).length ?? 0;
  return (
    <>
      <header>
        <div className="pn-detail-title">
          <h2>{run.entrypoint || "Agent run"}</h2>
          <StatusPill status={run.status} />
        </div>
        <div className="pn-detail-meta">
          <CopyText value={run.run_id} label="Copy run id" />
          <span className="pn-dim" title={fullTime(run.started_at)}>started {timeAgo(run.started_at)}</span>
          {run.conversation_id && (
            <Link to="/chat/$conversationId" params={{ conversationId: run.conversation_id }} className="pn-copy">
              open conversation <ChevronRight size={12} />
            </Link>
          )}
        </div>
      </header>
      <div className="stat-strip--compact">
        <StatStrip>
          <Stat
            label="Duration"
            value={<LiveDuration startedAt={run.started_at} status={run.status} durationS={run.duration_s} />}
            tone={run.status === "running" ? "var(--accent)" : undefined}
          />
          <Stat label="Subagents" value={run.subagents?.length ?? 0} />
          <Stat label="Tool calls" value={run.tool_calls?.length ?? 0} />
          <Stat label="Tool errors" value={toolErrors} tone={toolErrors ? "var(--err)" : undefined} />
        </StatStrip>
      </div>
    </>
  );
}
