import { useId, type CSSProperties } from "react";

/**
 * The product mark: an ember disc (the "O" of Open) with a pointer breaking
 * out of it. The pointer takes currentColor so it reads on any surface.
 */
export function AppMark({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  const id = `ab-mark-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ color: "var(--text)", flexShrink: 0, ...style }}>
      <defs>
        <mask id={id}>
          <rect width="32" height="32" fill="#fff" />
          <path d="M13 12 31 19.4 28.3 29.6 24.8 31.6 15.2 29.6Z" fill="#000" stroke="#000" strokeWidth="3.4" strokeLinejoin="round" />
        </mask>
      </defs>
      <circle cx="14.5" cy="14.5" r="13" fill="var(--accent)" mask={`url(#${id})`} />
      <path
        d="M13 12 31 19.4l-7.3 2.4 4.6 7.8-3.5 2-4.6-7.8-5 5.8Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth=".9"
        strokeLinejoin="round"
        transform="translate(3.29 3.16) scale(.87)"
      />
    </svg>
  );
}

/** Wordmark: mark plus product name, optional sublabel in mono. */
export function Wordmark({ sub, size = 28 }: { sub?: string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--text)" }}>
      <AppMark size={size} />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>
          Agentic Browser
        </span>
        {sub && (
          <span className="ab-eyebrow" style={{ fontSize: 9.5, marginTop: 3 }}>
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}
