/** Small bar plus number for a 0..1 confidence score. */
export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "var(--ok)" : pct >= 45 ? "var(--warn)" : "var(--err)";
  return (
    <span className="meter" title={`${pct}% confidence`}>
      <span className="meter__track">
        <span className="meter__fill" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="meter__value">{pct}</span>
    </span>
  );
}
