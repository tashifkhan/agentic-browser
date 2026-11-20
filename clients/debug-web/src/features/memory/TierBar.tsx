import { useMemoryStats } from "@agentic-browser/shared/query";
import { Dot } from "./Dot";
import { TIERS } from "./constants";

/** How active memories split across tiers, plus average confidence. */
export function TierBar() {
  const { data } = useMemoryStats();
  if (!data) return null;
  const counts: Record<string, number> = {};
  for (const r of data.by_tier_status) if (r.status === "active") counts[r.tier] = (counts[r.tier] ?? 0) + r.count;
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="tierbar ab-card">
      <div className="tierbar__track" aria-hidden="true">
        {TIERS.map((t) => (
          <span key={t.id} style={{ flex: (counts[t.id] ?? 0) / total, background: t.color, minWidth: counts[t.id] ? 4 : 0 }} />
        ))}
      </div>
      <div className="tierbar__legend">
        {TIERS.map((t) => (
          <span key={t.id} className="tierbar__item">
            <Dot color={t.color} /> {t.label} <strong>{counts[t.id] ?? 0}</strong>
          </span>
        ))}
        <span className="tierbar__item tierbar__avg">
          Average confidence <strong>{Math.round(data.avg_confidence * 100)}%</strong>
        </span>
      </div>
    </div>
  );
}
