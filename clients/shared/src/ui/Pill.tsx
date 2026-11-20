import type { ReactNode } from "react";

export type Tone = "neutral" | "ok" | "warn" | "err" | "live";

export function Pill({ tone = "neutral", dot = true, title, children }: { tone?: Tone; dot?: boolean; title?: string; children: ReactNode }) {
  const cls = ["ab-pill", tone !== "neutral" && `ab-pill--${tone}`, !dot && "ab-pill--plain"].filter(Boolean).join(" ");
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  running: "live", pending: "live", queued: "live", connecting: "live",
  completed: "ok", success: "ok", succeeded: "ok", ok: "ok", active: "ok", online: "ok", connected: "ok", configured: "ok",
  failed: "err", error: "err", errored: "err", offline: "err", missing: "err",
  blocked: "warn", cancelled: "warn", canceled: "warn", degraded: "warn", stale: "warn", initiated: "warn",
};

/** Pill whose colour follows a status word from the backend. */
export function StatusPill({ status }: { status: string | null | undefined }) {
  const s = (status || "unknown").toLowerCase();
  return <Pill tone={STATUS_TONE[s] ?? "neutral"}>{s}</Pill>;
}

export function toneFor(status: string | null | undefined): Tone {
  return STATUS_TONE[(status || "").toLowerCase()] ?? "neutral";
}
