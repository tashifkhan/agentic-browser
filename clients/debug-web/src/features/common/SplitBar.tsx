/** One bar split into coloured parts by value. */
export function SplitBar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <span className="pn-split" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => <span key={p.label} style={{ flexGrow: p.value, background: p.color }} title={`${p.label}: ${p.value}`} />)}
    </span>
  );
}
