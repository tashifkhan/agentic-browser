import { useState } from "react";
import type { ToolCallRecord } from "@agentic-browser/shared/api";
import { StateView, StatusPill } from "@agentic-browser/shared/ui";
import { ChevronRight, Wrench } from "@agentic-browser/shared/icons";
import { clockTime } from "@agentic-browser/shared/format";
import { LiveDuration } from "../common/LiveDuration";

const COLS = "minmax(140px, 0.9fr) 96px minmax(0, 2fr) 70px 70px 16px";

function ToolCallItem({ t }: { t: ToolCallRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pn-item">
      <button type="button" className="pn-item__head" style={{ gridTemplateColumns: COLS }} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="pn-id pn-clip">{t.tool_name}</span>
        <StatusPill status={t.status} />
        <span className={`pn-clip ${t.error ? "pn-err" : "pn-dim"}`} style={{ fontSize: 12 }}>{t.error ?? JSON.stringify(t.args ?? {})}</span>
        <span className="pn-num pn-right"><LiveDuration startedAt={t.started_at} status={t.status} durationS={t.duration_s} /></span>
        <span className="pn-dim pn-right">{clockTime(t.started_at)}</span>
        <ChevronRight size={14} className="pn-item__chev" />
      </button>
      {open && (
        <div className="pn-item__body">
          <pre className="pn-payload">{JSON.stringify(t.args, null, 2)}</pre>
          {t.error && <pre className="pn-payload pn-err">{t.error}</pre>}
        </div>
      )}
    </div>
  );
}

/** Tool calls with their arguments; click a row to see the full payload. */
export function RunToolCalls({ calls }: { calls: ToolCallRecord[] }) {
  if (calls.length === 0) {
    return <StateView icon={<Wrench size={18} />} title="No tool calls" body="No tools were called during this run." />;
  }
  return (
    <div className="pn-list">
      <div className="pn-thead" style={{ gridTemplateColumns: COLS }}>
        <span>Tool</span>
        <span>Status</span>
        <span>Arguments or error</span>
        <span className="pn-right">Time</span>
        <span className="pn-right">At</span>
        <span />
      </div>
      {calls.map((t) => <ToolCallItem key={t.tool_call_id} t={t} />)}
    </div>
  );
}
