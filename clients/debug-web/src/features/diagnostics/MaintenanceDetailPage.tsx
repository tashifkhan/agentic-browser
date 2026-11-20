import { useParams } from "@tanstack/react-router";
import { useMaintenance } from "@agentic-browser/shared/query";
import { QueryView, Skeleton } from "@agentic-browser/shared/ui";
import { Stethoscope } from "@agentic-browser/shared/icons";
import { BackLink } from "../common/BackLink";
import { PageEmpty, PageFrame } from "../common/PageState";
import { MaintenanceDetail } from "./MaintenanceDetail";
import "../common/panels.css";

function DetailSkeleton() {
  return (
    <div className="pn" aria-busy="true">
      <Skeleton width={300} height={20} />
      <Skeleton height={64} style={{ borderRadius: "var(--r-3)" }} />
      <Skeleton height={260} style={{ borderRadius: "var(--r-3)" }} />
    </div>
  );
}

export function MaintenanceDetailPanel() {
  const { runId } = useParams({ from: "/diagnostics/$runId" });
  const q = useMaintenance();
  return (
    <div className="pn">
      <BackLink to="/diagnostics">All maintenance runs</BackLink>
      {q.isError && !q.data ? (
        <PageFrame>
          <QueryView query={q} skeleton={null}>{() => null}</QueryView>
        </PageFrame>
      ) : (
        <QueryView query={q} skeleton={<DetailSkeleton />}>
          {(runs) => {
            const run = runs.find((r) => r.run_id === runId);
            return run ? (
              <MaintenanceDetail run={run} />
            ) : (
              <PageEmpty icon={<Stethoscope size={18} />} title="Maintenance run not found" body="It may have been pruned from history. Pick another run from the list." />
            );
          }}
        </QueryView>
      )}
    </div>
  );
}
