import { Card, Skeleton } from "@agentic-browser/shared/ui";

/** Same shape as the loaded overview, so nothing jumps when data arrives. */
export function OverviewSkeleton() {
  return (
    <div className="pn" aria-busy="true" aria-label="Loading overview">
      <div className="stat-strip ab-card">
        {[0, 1, 2, 3].map((i) => (
          <div className="stat" key={i}>
            <Skeleton width={70} height={10} />
            <Skeleton width={110} height={28} style={{ marginTop: 4 }} />
            <Skeleton width={90} height={10} />
            <Skeleton height={22} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
      <div className="pn-grid-2">
        {[0, 1].map((i) => (
          <Card key={i} title={<Skeleton width={120} height={14} />}>
            <Skeleton height={176} />
          </Card>
        ))}
      </div>
      <div className="pn-grid-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} title={<Skeleton width={100} height={14} />}>
            <div style={{ display: "grid", gap: 12 }}>
              {[0, 1, 2, 3].map((j) => <Skeleton key={j} height={12} width={`${90 - j * 12}%`} />)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
