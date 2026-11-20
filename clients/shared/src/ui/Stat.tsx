import { useId, type ReactNode } from "react";

/** Small area chart for a stat cell. */
export function Sparkline({ values, color = "var(--accent)", height = 26 }: { values: number[]; color?: string; height?: number }) {
  const id = `spark-${useId().replace(/:/g, "")}`;
  if (values.length < 2) return <div style={{ height }} />;
  const W = 120;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, height - 2 - (v / max) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Stat({ label, value, unit, sub, trend, tone }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; trend?: number[]; tone?: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value" style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="stat__sub">{sub}</span>}
      {trend && <Sparkline values={trend} color={tone} />}
    </div>
  );
}

/** Row of stats separated by hairlines. */
export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="stat-strip ab-card">{children}</div>;
}
