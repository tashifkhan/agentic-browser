import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useRuns, useStats } from "@agentic-browser/shared/query";
import { Button, QueryView, SearchField, Segmented } from "@agentic-browser/shared/ui";
import { Inbox, Search } from "@agentic-browser/shared/icons";
import { PageEmpty } from "../common/PageState";
import { RunsTable, RunsTableSkeleton } from "./RunsTable";
import "../common/panels.css";

const FILTERS = ["all", "running", "completed", "failed"] as const;
type Filter = (typeof FILTERS)[number];
const LIMIT = 100;

export function RunsPanel() {
  const [status, setStatus] = useState<Filter>("all");
  const [text, setText] = useState("");
  const runs = useRuns({ status: status === "all" ? undefined : status, limit: LIMIT });
  const stats = useStats();

  const counts = stats.data?.runs;
  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!runs.data || !q) return runs.data;
    return runs.data.filter((r) =>
      [r.run_id, r.entrypoint, r.final_answer ?? "", r.error ?? "", r.conversation_id].some((v) => v.toLowerCase().includes(q)),
    );
  }, [runs.data, text]);

  return (
    <div className="pn">
      <div className="pn-toolbar">
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === "all" ? "All" : f[0].toUpperCase() + f.slice(1),
            count: counts ? (f === "all" ? counts.total : counts[f]) : undefined,
          }))}
        />
        <SearchField value={text} onChange={setText} placeholder="Filter by id, entrypoint or answer" width={260} />
        <div className="pn-toolbar__end">
          {filtered && <span className="pn-count">{filtered.length === LIMIT ? `latest ${LIMIT}` : `${filtered.length} shown`}</span>}
        </div>
      </div>

      <QueryView
        query={runs}
        isEmpty={() => (filtered?.length ?? 0) === 0}
        skeleton={<RunsTableSkeleton />}
        empty={
          text ? (
            <PageEmpty icon={<Search size={18} />} title="No runs match" body={<>Nothing matches <span className="ab-mono">{text}</span>. Try part of a run id or a word from the answer.</>} action={<Button size="sm" onClick={() => setText("")}>Clear filter</Button>} />
          ) : status !== "all" ? (
            <PageEmpty icon={<Inbox size={18} />} title={`No ${status} runs`} body="Switch to All to see every run." action={<Button size="sm" onClick={() => setStatus("all")}>Show all</Button>} />
          ) : (
            <PageEmpty
              icon={<Inbox size={18} />}
              title="No runs yet"
              body="Runs appear here as soon as the agent works on something. Send a message from Chat or the browser extension."
              action={<Link to="/chat" className="ab-btn ab-btn--sm ab-btn--primary" style={{ textDecoration: "none" }}>Open chat</Link>}
            />
          )
        }
      >
        {() => <RunsTable runs={filtered ?? []} />}
      </QueryView>
    </div>
  );
}
