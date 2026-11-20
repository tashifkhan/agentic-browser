import { useStats, useTimeseries } from "@agentic-browser/shared/query";
import { QueryView } from "@agentic-browser/shared/ui";
import { PageFrame } from "../common/PageState";
import { ActivityCharts } from "./ActivityCharts";
import { MemoryTiers, RunOutcomes } from "./BreakdownCards";
import { KeyNumbers } from "./KeyNumbers";
import { OverviewSkeleton } from "./OverviewSkeleton";
import { RecentRuns } from "./RecentRuns";
import "../common/panels.css";

export function DashboardPanel() {
  const stats = useStats();
  const series = useTimeseries(30);

  if (stats.isError && !stats.data) {
    return (
      <PageFrame>
        <QueryView query={stats} skeleton={null}>{() => null}</QueryView>
      </PageFrame>
    );
  }

  return (
    <QueryView query={stats} skeleton={<OverviewSkeleton />}>
      {(s) => (
        <div className="pn ab-stagger">
          <KeyNumbers stats={s} series={series.data?.slice(-14)} />
          <ActivityCharts />
          <section className="pn-grid-3">
            <RecentRuns />
            <RunOutcomes stats={s} />
            <MemoryTiers stats={s} />
          </section>
        </div>
      )}
    </QueryView>
  );
}
