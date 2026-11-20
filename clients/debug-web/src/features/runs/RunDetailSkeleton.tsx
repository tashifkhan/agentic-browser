import { Skeleton } from "@agentic-browser/shared/ui";

export function RunDetailSkeleton() {
  return (
    <div className="pn" aria-busy="true" aria-label="Loading run">
      <div style={{ display: "grid", gap: 8 }}>
        <Skeleton width={260} height={20} />
        <Skeleton width={360} height={11} />
      </div>
      <Skeleton height={64} style={{ borderRadius: "var(--r-3)" }} />
      <Skeleton height={120} style={{ borderRadius: "var(--r-3)" }} />
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={14} width={`${80 - i * 8}%`} />)}
      </div>
    </div>
  );
}
