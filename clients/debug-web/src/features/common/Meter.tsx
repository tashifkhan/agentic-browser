/** Labelled horizontal bar with value and share of total. */
export function Meter({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="pn-meter">
      <span className="pn-meter__label">
        <span className="pn-swatch" style={{ background: color }} />
        {label}
      </span>
      <div className="pn-meter__track">
        <div className="pn-meter__fill" style={{ width: `${value > 0 ? Math.max(pct, 1.5) : 0}%`, background: color }} />
      </div>
      <span className="pn-num pn-right">
        {value.toLocaleString()}
        <span className="pn-dim" style={{ marginLeft: 6 }}>{total > 0 ? `${Math.round(pct)}%` : ""}</span>
      </span>
    </div>
  );
}

/** Label and number on one line, under a set of meters. */
export function MeterTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="pn-meter" style={{ gridTemplateColumns: "1fr auto" }}>
      <span className="pn-meter__label">{label}</span>
      <span className="pn-num">{value.toLocaleString()}</span>
    </div>
  );
}
