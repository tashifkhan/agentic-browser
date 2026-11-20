import type { CSSProperties, ReactNode } from "react";

type StateKind = "empty" | "error" | "loading";

/**
 * One layout for empty, error and loading states, so every surface fails
 * the same way: what happened, why it matters, and what to do next.
 */
export function StateView({
  kind = "empty",
  icon,
  title,
  body,
  detail,
  action,
  style,
}: {
  kind?: StateKind;
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={`ab-state ab-rise${kind === "error" ? " ab-state--error" : ""}`} style={style} role={kind === "error" ? "alert" : undefined}>
      <div className="ab-state__glyph">{kind === "loading" ? <span className="ab-spinner" /> : icon}</div>
      <div className="ab-state__title">{title}</div>
      {body && <div className="ab-state__body">{body}</div>}
      {detail && <div className="ab-state__detail">{detail}</div>}
      {action && <div style={{ marginTop: 6, display: "flex", gap: 8 }}>{action}</div>}
    </div>
  );
}

/** Turns fetch errors into something a person can act on. */
export function describeError(error: unknown): { title: string; body: string; detail?: string } {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/failed to fetch|networkerror|load failed|ECONNREFUSED/i.test(message)) {
    return {
      title: "Backend is offline",
      body: "Nothing answered on the API port. Start it with `uv run agentic-api-run` and this page reconnects on its own.",
      detail: message,
    };
  }
  if (/\b5\d\d\b/.test(message)) {
    return {
      title: "The backend hit an error",
      body: "The API is running but this request failed, usually because Postgres, Neo4j or OpenSearch isn't up. Check the backend logs.",
      detail: message,
    };
  }
  if (/\b40[13]\b/.test(message)) {
    return { title: "Not signed in", body: "Sign in again to load this.", detail: message };
  }
  return { title: "Something went wrong", body: "This view couldn't load.", detail: message || undefined };
}
