import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { RunDetail } from "@agentic-browser/shared/api";
import { useRun } from "@agentic-browser/shared/query";
import { QueryView, Segmented } from "@agentic-browser/shared/ui";
import { BackLink } from "../common/BackLink";
import { PageFrame } from "../common/PageState";
import { RunDetailSkeleton } from "./RunDetailSkeleton";
import { RunHeader } from "./RunHeader";
import { RunResult } from "./RunResult";
import { RunSubagents } from "./RunSubagents";
import { RunToolCalls } from "./RunToolCalls";
import { RunTrace } from "./RunTrace";
import "../common/panels.css";

type Tab = "trace" | "subagents" | "tools";

function RunDetailView({ run }: { run: RunDetail }) {
  const [tab, setTab] = useState<Tab>("trace");
  const live = run.status === "running";
  return (
    <div className="pn ab-stagger">
      <RunHeader run={run} />
      <RunResult run={run} />
      <section>
        <div className="pn-section-head">
          <Segmented
            label="Run details"
            value={tab}
            onChange={setTab}
            options={[
              { value: "trace", label: "Trace" },
              { value: "subagents", label: "Subagents", count: run.subagents?.length ?? 0 },
              { value: "tools", label: "Tool calls", count: run.tool_calls?.length ?? 0 },
            ]}
          />
        </div>
        <div key={tab} className="ab-fade">
          {tab === "trace" && <RunTrace runId={run.run_id} live={live} />}
          {tab === "subagents" && <RunSubagents subagents={run.subagents ?? []} />}
          {tab === "tools" && <RunToolCalls calls={run.tool_calls ?? []} />}
        </div>
      </section>
    </div>
  );
}

export function RunDetailPanel() {
  const { runId } = useParams({ from: "/runs/$runId" });
  const q = useRun(runId);
  return (
    <div className="pn">
      <BackLink to="/runs">All runs</BackLink>
      {q.isError && !q.data ? (
        <PageFrame>
          <QueryView query={q} skeleton={null}>{() => null}</QueryView>
        </PageFrame>
      ) : (
        <QueryView query={q} skeleton={<RunDetailSkeleton />}>
          {(run) => <RunDetailView run={run} />}
        </QueryView>
      )}
    </div>
  );
}
