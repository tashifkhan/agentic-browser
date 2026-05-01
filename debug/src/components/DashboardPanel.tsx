import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatTile({
  label,
  value,
  sub,
  accent,
  glow,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  glow?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        borderColor: glow ? "var(--accent-color)" : "var(--border-color)",
        background: glow ? "var(--card-bg)" : "var(--section-bg)",
      }}
    >
      <span className="section-label" style={{ color: accent }}>{label}</span>
      <span
        className="mono"
        style={{
          fontSize: 28,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          color: accent ?? "var(--text-primary)",
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.02em",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

// ── Stacked area chart ────────────────────────────────────────────────────────

interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

function AreaChart({
  data,
  series,
  format,
}: {
  data: Record<string, unknown>[];
  series: ChartSeries[];
  format?: (v: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const W = 800;
  const PL = 40;
  const PR = 12;
  const cW = W - PL - PR;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!data) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * W;
      const cx = mx - PL;
      if (cx < 0 || cx > cW) { setHoverIdx(null); return; }
      setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round((cx / cW) * (data.length - 1)))));
    },
    [data, cW]
  );

  if (!data || data.length < 2) {
    return (
      <div
        style={{
          height: 160,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="shimmer section-label" style={{ backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>
          Loading data...
        </span>
      </div>
    );
  }

  const H = 160;
  const PT = 8;
  const PB = 24;
  const cH = H - PT - PB;

  const stacked = (data || []).map((d) => {
    let cum = 0;
    const layers: number[] = [];
    const raw: number[] = [];
    for (const s of (series || [])) {
      const v = (d[s.key] as number) ?? 0;
      raw.push(v);
      cum += v;
      layers.push(cum);
    }
    return { day: String(d.day ?? ""), layers, raw, total: cum };
  });

  const maxVal = Math.max(...(stacked || []).map((d) => d.total), 1);
  const x = (i: number) => PL + (i / (data.length - 1)) * cW;
  const y = (v: number) => PT + cH - (v / maxVal) * cH;

  const areaPaths: string[] = [];
  for (let k = series.length - 1; k >= 0; k--) {
    const top = stacked.map((d, i) => `${x(i)},${y(d.layers[k])}`).join(" L");
    const bot =
      k > 0
        ? stacked
            .map((d, i) => `${x(i)},${y(d.layers[k - 1])}`)
            .reverse()
            .join(" L")
        : stacked
            .map((_, i) => `${x(i)},${y(0)}`)
            .reverse()
            .join(" L");
    areaPaths.push(`M${top} L${bot} Z`);
  }

  const linePaths = series.map((_, k) =>
    `M${stacked.map((d, i) => `${x(i)},${y(d.layers[k])}`).join(" L")}`
  );

  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels: { i: number; label: string }[] = [];
  for (let i = 0; i < data.length; i += step)
    xLabels.push({ i, label: String(data[i].day ?? "").slice(5) });
  if (xLabels[xLabels.length - 1]?.i !== data.length - 1)
    xLabels.push({ i: data.length - 1, label: String(data[data.length - 1].day ?? "").slice(5) });

  const yTicks = [0, maxVal * 0.5, maxVal];
  const gridColor = "var(--border-color)";
  const textColor = "var(--text-muted)";
  const fmt2 = format ?? ((v: number) => String(Math.round(v)));

  const hovered = hoverIdx !== null ? stacked[hoverIdx] : null;
  const tooltipLeft = hoverIdx !== null ? (x(hoverIdx) / W) * 100 : 0;
  const flipTooltip = tooltipLeft > 62;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", overflow: "visible" }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PL} x2={W - PR}
              y1={y(v)} y2={y(v)}
              stroke={gridColor}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            <text
              x={PL - 8} y={y(v) + 3.5}
              textAnchor="end"
              fill={textColor}
              fontSize={9}
              fontFamily="var(--font-mono)"
            >
              {fmt2(v)}
            </text>
          </g>
        ))}

        {/* Area fills */}
        {areaPaths.map((path, i) => (
          <path key={i} d={path} fill={series[i].color} opacity={0.15} />
        ))}

        {/* Lines */}
        {linePaths.map((path, i) => (
          <path key={i} d={path} fill="none" stroke={series[i].color} strokeWidth={2} />
        ))}

        {/* X labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={x(i)} y={H - 3}
            textAnchor="middle"
            fill={textColor}
            fontSize={10}
            fontFamily="var(--font-mono)"
          >
            {label}
          </text>
        ))}

        {/* Crosshair + dots */}
        {hoverIdx !== null && hovered && (
          <>
            <line
              x1={x(hoverIdx)} x2={x(hoverIdx)}
              y1={PT} y2={PT + cH}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            {series.map((s, k) => (
              <circle
                key={k}
                cx={x(hoverIdx)}
                cy={y(hovered.layers[k])}
                r={4}
                fill="var(--section-bg)"
                stroke={s.color}
                strokeWidth={2}
              />
            ))}
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hoverIdx !== null && hovered && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: 4,
            left: flipTooltip ? undefined : `calc(${tooltipLeft}% + 10px)`,
            right: flipTooltip ? `calc(${100 - tooltipLeft}% + 10px)` : undefined,
            padding: "10px 14px",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 140,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: "var(--text-muted)",
              marginBottom: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              borderBottom: "1px solid var(--border-color)",
              paddingBottom: 4
            }}
          >
            {hovered.day}
          </div>
          {series.map((s, k) => (
            <div
              key={k}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "3px 0",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 500 }}>{s.label}</span>
              <span
                className="mono"
                style={{ marginLeft: "auto", paddingLeft: 12, fontWeight: 600, color: "var(--text-primary)" }}
              >
                {fmt2(hovered.raw[k])}
              </span>
            </div>
          ))}
          {series.length > 1 && (
            <div
              style={{
                borderTop: "1px solid var(--border-color)",
                marginTop: 6,
                paddingTop: 6,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Total</span>
              <span className="mono" style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12 }}>
                {fmt2(hovered.total)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 10,
          paddingLeft: PL,
        }}
      >
        {series.map((s) => (
          <div
            key={s.key}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: s.color,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stacked bar for breakdown ────────────────────────────────────────────────

function BarRow({
  label,
  value,
  total,
  color,
  format,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  format?: (v: number) => string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        style={{
          width: 90,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-muted)",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--input-bg)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.max(pct, value > 0 ? 1 : 0)}%`,
            background: color,
            borderRadius: 3,
            transition: "width 0.5s ease-out",
          }}
        />
      </div>
      <span
        className="mono"
        style={{
          width: 40,
          textAlign: "right",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {format ? format(value) : value}
      </span>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function DashboardPanel() {
  const [range, setRange] = useState<7 | 14 | 30>(30);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
    refetchInterval: 4000,
  });

  const { data: ts } = useQuery({
    queryKey: ["timeseries", range],
    queryFn: () => api.timeseries(range),
    refetchInterval: 30000,
  });

  const filtered = ts
    ? ts.slice(Math.max(0, ts.length - range))
    : undefined;

  if (statsLoading || !stats) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="card shimmer"
              style={{ height: 110 }}
            />
          ))}
        </div>
      </div>
    );
  }

  const failRate =
    stats.runs.total > 0
      ? ((stats.runs.failed / stats.runs.total) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <StatTile
          label="Total Runs"
          value={fmt(stats.runs.total)}
          sub={`${stats.runs.running} Running`}
        />
        <StatTile
          label="Completed"
          value={fmt(stats.runs.completed)}
          accent="var(--status-connected-text)"
        />
        <StatTile
          label="Failed"
          value={fmt(stats.runs.failed)}
          accent={stats.runs.failed > 0 ? "var(--status-disconnected-text)" : undefined}
        />
        <StatTile
          label="Failure Rate"
          value={`${failRate}%`}
          accent={Number(failRate) > 20 ? "var(--status-disconnected-text)" : undefined}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <StatTile label="Conversations" value={fmt(stats.conversations)} />
        <StatTile label="Tool Calls" value={fmt(stats.tool_calls)} />
        <StatTile label="Events" value={fmt(stats.events)} />
        <StatTile
          label="Memory Claims"
          value={fmt(stats.memory.total_active)}
          sub={`${fmt(stats.memory.sources)} Sources`}
          accent="var(--accent-color)"
          glow
        />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Runs chart */}
        <div className="card" style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <span className="section-label">Runs Over Time</span>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "var(--input-bg)",
                borderRadius: 999, /* Pill shape */
                padding: 4,
                gap: 4,
                border: "1px solid var(--border-color)",
              }}
            >
              {([7, 14, 30] as const).map((d) => {
                const isActive = range === d;
                return (
                  <button
                    key={d}
                    onClick={() => setRange(d)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999, /* Pill shape */
                      border: "none",
                      background: isActive ? "var(--bg-color)" : "transparent",
                      color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                      boxShadow: isActive ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 600,
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    {d}d
                  </button>
                );
              })}
            </div>
          </div>
          <AreaChart
            data={(filtered ?? []) as unknown as Record<string, unknown>[]}
            series={[
              { key: "runs", label: "Runs", color: "var(--sky)" },
            ]}
          />
        </div>

        {/* Tool calls chart */}
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ marginBottom: 20 }}>
            <span className="section-label">Tool Calls Over Time</span>
          </div>
          <AreaChart
            data={(filtered ?? []) as unknown as Record<string, unknown>[]}
            series={[
              { key: "tool_calls", label: "Tool Calls", color: "var(--accent-color)" },
            ]}
          />
        </div>
      </div>

      {/* Breakdown row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Run status breakdown */}
        <div className="card" style={{ padding: "20px" }}>
          <span
            className="section-label"
            style={{ display: "block", marginBottom: 20 }}
          >
            Run Status
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <BarRow
              label="Completed"
              value={stats.runs.completed}
              total={stats.runs.total}
              color="var(--status-connected-text)"
            />
            <BarRow
              label="Failed"
              value={stats.runs.failed}
              total={stats.runs.total}
              color="var(--status-disconnected-text)"
            />
            <BarRow
              label="Running"
              value={stats.runs.running}
              total={stats.runs.total}
              color="var(--sky)"
            />
          </div>
        </div>

        {/* Memory tiers */}
        <div className="card" style={{ padding: "20px" }}>
          <span
            className="section-label"
            style={{ display: "block", marginBottom: 20 }}
          >
            Memory Tiers
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <BarRow
              label="Short-term"
              value={stats.memory.short_term}
              total={stats.memory.total_active}
              color="var(--sky)"
            />
            <BarRow
              label="Long-term"
              value={stats.memory.long_term}
              total={stats.memory.total_active}
              color="var(--accent-color)"
            />
            <BarRow
              label="Permanent"
              value={stats.memory.permanent}
              total={stats.memory.total_active}
              color="var(--amber)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
