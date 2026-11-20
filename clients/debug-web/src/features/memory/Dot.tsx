export function Dot({ color }: { color: string }) {
  return <span className="mem-dot" style={{ background: color }} aria-hidden="true" />;
}
