import { useCallback, useState } from "react";
import type { TimeseriesBucket } from "@agentic-browser/shared/api";
import { compact } from "@agentic-browser/shared/format";
import { useElementWidth } from "../common/useElementWidth";

const H = 176;
const PAD = { l: 34, r: 6, t: 10, b: 22 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag * 4 >= v) ?? 10;
  return step * mag * 4;
}

export function dayLabel(day: string) {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day.slice(5) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Daily chart drawn at real pixel width so text never stretches. Bars suit
 * discrete runs; a filled line suits higher-volume tool calls.
 */
export function DailyChart({
  data,
  field,
  kind,
  color,
  label,
}: {
  data: TimeseriesBucket[];
  field: "runs" | "tool_calls";
  kind: "bars" | "area";
  color: string;
  label: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const cW = Math.max(10, width - PAD.l - PAD.r);
  const cH = H - PAD.t - PAD.b;
  const values = data.map((d) => Number(d[field] ?? 0));
  const max = niceMax(Math.max(...values, 0));
  const n = data.length;
  const slot = n > 0 ? cW / n : cW;
  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const y = (v: number) => PAD.t + cH - (v / max) * cH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(cW / 64))));

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.l) / slot);
      setHover(i >= 0 && i < n ? i : null);
    },
    [slot, n],
  );

  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${x(n - 1)},${PAD.t + cH} L${x(0)},${PAD.t + cH} Z` : "";
  const gradId = `grad-${field}`;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="pn-chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${label} per day, ${total} total`}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.24" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, max / 2, max].map((t, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={i === 0 ? undefined : "2 4"} />
              <text x={PAD.l - 8} y={y(t) + 3} textAnchor="end">{compact(Math.round(t))}</text>
            </g>
          ))}
          {hover !== null && <rect x={PAD.l + slot * hover} y={PAD.t} width={slot} height={cH} fill="var(--hover)" opacity="0.7" rx="3" />}
          {kind === "bars"
            ? values.map((v, i) => {
                const bw = Math.max(2, Math.min(18, slot * 0.62));
                const h = Math.max(v > 0 ? 2 : 0, PAD.t + cH - y(v));
                return <rect key={i} x={x(i) - bw / 2} y={PAD.t + cH - h} width={bw} height={h} rx={Math.min(3, bw / 2)} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />;
              })
            : n > 1 && (
                <>
                  <path d={area} fill={`url(#${gradId})`} />
                  <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
                  {hover !== null && <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="var(--surface)" stroke={color} strokeWidth={2} />}
                </>
              )}
          {data.map((d, i) =>
            // Label every Nth day, plus the last one when it won't collide.
            i % labelEvery === 0 || (i === n - 1 && (n - 1) % labelEvery >= Math.ceil(labelEvery / 2)) ? (
              <text key={d.day} x={x(i)} y={H - 6} textAnchor="middle">{dayLabel(d.day)}</text>
            ) : null,
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="pn-tip" style={x(hover) > width * 0.66 ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }}>
          <div className="pn-tip__day">{dayLabel(data[hover].day)}</div>
          <div className="pn-tip__row">
            <span className="pn-swatch" style={{ background: color }} />
            {label}
            <b>{values[hover].toLocaleString()}</b>
          </div>
        </div>
      )}
    </div>
  );
}
