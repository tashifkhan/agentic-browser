import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, type MaintenanceRun } from "../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  micro_reflection: {
    label: "Micro",
    color: "var(--sky)",
    icon: "◦",
  },
  hourly: {
    label: "Hourly",
    color: "var(--teal)",
    icon: "◎",
  },
  nightly: {
    label: "Nightly",
    color: "var(--violet)",
    icon: "◉",
  },
  weekly: {
    label: "Weekly",
    color: "var(--accent)",
    icon: "●",
  },
};

function duration(run: MaintenanceRun): string {
  if (!run.started_at || !run.finished_at) return "—";
  const s =
    (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) /
    1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const isRunning = status === "running";
  return (
    <span
      className="badge"
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid var(--border-color)",
        background: "transparent",
        color: "var(--text-primary)",
        fontSize: 11,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {isRunning && (
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            width: 6,
            height: 6,
          }}
        >
          <span
            className="pulse-ring"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "var(--sky)",
            }}
          />
          <span
            style={{
              position: "relative",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--sky)",
            }}
          />
        </span>
      )}
      {status}
    </span>
  );
}

// ── Run detail ────────────────────────────────────────────────────────────────

function RunDetail({
  run,
  onBack,
}: {
  run: MaintenanceRun;
  onBack: () => void;
}) {
  const typeCfg = TYPE_CONFIG[run.run_type] ?? TYPE_CONFIG.nightly;

  const phases: { label: string; icon: JSX.Element; color: string; detail: string }[] = [
    {
      label: "Run started",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 22 12 12 22 2 12" />
        </svg>
      ),
      color: "var(--sky)",
      detail: `Type: ${run.run_type} • ${run.started_at ? new Date(run.started_at).toLocaleString() : "—"}`,
    },
    {
      label: "Claims reviewed",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      ),
      color: "var(--text-muted)",
      detail: `${run.claims_reviewed ?? 0} claims scanned`,
    },
    {
      label: "Claims updated",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" fill="var(--bg-color)" />
        </svg>
      ),
      color: "var(--text-primary)",
      detail: `${run.claims_updated ?? 0} claims updated / promoted`,
    },
    {
      label: "Claims archived",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
      color: "var(--amber)",
      detail: `${run.claims_archived ?? 0} claims archived / pruned`,
    },
    {
      label:
        run.status === "completed"
          ? "Completed"
          : run.status === "failed"
            ? "Failed"
            : "Running…",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
      color: run.status === "completed" ? "var(--text-primary)" : run.status === "failed" ? "var(--red)" : "var(--sky)",
      detail: run.finished_at
        ? `Finished at ${new Date(run.finished_at).toLocaleString()} • ${duration(run)}`
        : "Still running…",
    },
  ];

  return (
    <div
      className="fade-in"
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-color)" }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 13,
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          ← Back
        </button>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {typeCfg.label} Maintenance
        </span>
        <StatusBadge status={run.status} />
        <span
          className="mono"
          style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)" }}
        >
          {timeAgo(run.started_at)}
        </span>
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          padding: "32px 20px",
          flexShrink: 0,
        }}
      >
        {[
          { label: "REVIEWED", value: run.claims_reviewed },
          { label: "UPDATED", value: run.claims_updated },
          { label: "ARCHIVED", value: run.claims_archived },
          { label: "DURATION", value: duration(run) },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 32,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {s.value ?? 0}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Phase timeline */}
      <div style={{ flex: 1, overflow: "auto", padding: "32px 24px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: "var(--text-muted)",
            marginBottom: 24,
          }}
        >
          PIPELINE TIMELINE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {phases.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 16,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    color: p.color,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  {p.icon}
                </div>
                {i < phases.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      width: 1,
                      background: "var(--border-color)",
                      marginTop: 8,
                      marginBottom: -16,
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: 4 }}>
                <div
                  style={{
                    color: p.color,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  {p.label}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  {p.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Run card ─────────────────────────────────────────────────────────────────

function RunCard({
  run,
  onClick,
}: {
  run: MaintenanceRun;
  onClick: () => void;
}) {
  const typeCfg = TYPE_CONFIG[run.run_type] ?? TYPE_CONFIG.nightly;

  return (
    <Link
      to="/diagnostics/$runId"
      params={{ runId: run.run_id }}
      onClick={onClick}
      className="fade-in"
      style={{
        padding: "24px 20px",
        cursor: "pointer",
        transition: "background 0.1s",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        textDecoration: "none",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-2)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      {/* Row 1 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {typeCfg.label} Run
        </span>

        <StatusBadge status={run.status} />

        <span
          className="mono"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          {timeAgo(run.started_at)} • {duration(run)}
        </span>
      </div>

      {/* Row 2: metrics */}
      <div
        style={{
          display: "flex",
          gap: 24,
        }}
      >
        {[
          { label: "reviewed", value: run.claims_reviewed },
          { label: "updated", value: run.claims_updated },
          { label: "archived", value: run.claims_archived },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}
            >
              {m.value ?? 0}
            </span>
            <span
              style={{ fontSize: 12, color: "var(--text-muted)" }}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function MaintenancePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance"],
    queryFn: api.maintenance,
    refetchInterval: 15000,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: "var(--text-muted)",
          }}
        >
          MEMORY MAINTENANCE
        </span>
        {data && (
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-primary)" }}
          >
            {data.length} runs
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="shimmer"
                style={{
                  height: 68,
                  borderBottom: "1px solid var(--border-color)",
                }}
              />
            ))
          : !data || data.length === 0
            ? (
              <div
                style={{
                  padding: "40px 24px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-faint)",
                    marginBottom: 8,
                  }}
                >
                  No maintenance runs yet.
                </p>
                <p style={{ fontSize: 11, color: "var(--text-faint)", opacity: 0.7 }}>
                  Maintenance runs are scheduled hourly, nightly, and weekly via the
                  APScheduler configured in{" "}
                  <span className="mono">main.py</span>.
                </p>
              </div>
            )
            : data.map((r) => (
                <RunCard
                  key={r.run_id}
                  run={r}
                  onClick={() => undefined}
                />
              ))}
      </div>
    </div>
  );
}

export function MaintenanceDetailPanel() {
  const navigate = useNavigate();
  const { runId } = useParams({ from: "/diagnostics/$runId" });

  const { data, isLoading } = useQuery({
    queryKey: ["maintenance"],
    queryFn: api.maintenance,
    refetchInterval: 15000,
  });

  if (isLoading) {
    return <div className="shimmer" style={{ margin: 20, height: 120, borderRadius: 12 }} />;
  }

  const run = data?.find((item) => item.run_id === runId);

  if (!run) {
    return (
      <div style={{ padding: 24 }}>
        <button
          type="button"
          onClick={() => navigate({ to: "/diagnostics" })}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 0,
            marginBottom: 16,
            fontFamily: "inherit",
          }}
        >
          ← Back
        </button>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Maintenance run not found.</p>
      </div>
    );
  }

  return <RunDetail run={run} onBack={() => navigate({ to: "/diagnostics" })} />;
}
