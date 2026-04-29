import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, type Run, type RunEvent } from "../lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(s: number | null) {
  if (s === null) return "—";
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
function ts(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Status badge ─────────────────────────────────────────────────────────────

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

// ── Run card (list view) ─────────────────────────────────────────────────────

function RunCard({ run, onClick }: { run: Run; onClick: () => void }) {
  return (
    <Link
      to="/runs/$runId"
      params={{ runId: run.run_id }}
      onClick={onClick}
      className="fade-in card"
      style={{
        padding: "16px 20px",
        margin: "12px 20px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        textDecoration: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <StatusBadge status={run.status} />

        <span
          className="mono"
          style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}
        >
          {run.run_id.slice(4, 16)}
        </span>

        <span
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          {run.entrypoint}
        </span>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {elapsed(run.duration_s)}
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
            {timeAgo(run.started_at)}
          </span>
        </div>
      </div>

      {(run.final_answer || run.error) && (
        <p
          style={{
            fontSize: 13,
            color: run.error ? "var(--status-disconnected-text)" : "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingLeft: 4,
            marginTop: 4,
          }}
        >
          {run.error ? `⚠ ${run.error.slice(0, 150)}` : run.final_answer?.slice(0, 150)}
        </p>
      )}
    </Link>
  );
}

// ── Timeline row (for events) ────────────────────────────────────────────────

function EventTimelineRow({
  ev,
  isLast,
}: {
  ev: RunEvent;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isToolCall = ev.event_type === "subagent_tool_call";
  const isToolResult = ev.event_type === "subagent_tool_result";
  const isError = ev.event_type.includes("error");
  const isCompleted = ev.event_type.includes("completed");
  const isStarted = ev.event_type.includes("started");

  const dotColor = isError
    ? "var(--red)"
    : isToolCall
      ? "var(--sky)"
      : isCompleted
        ? "var(--green)"
        : isStarted
          ? "var(--accent)"
          : "var(--text-faint)";

  const labelColor = isError
    ? "var(--red)"
    : isToolCall
      ? "var(--sky)"
      : isToolResult
        ? "var(--text-faint)"
        : isCompleted
          ? "var(--green)"
          : "var(--text-faint)";

  const toolName =
    typeof ev.payload?.tool === "string" ? ev.payload.tool : null;
  const subagent =
    typeof ev.payload?.subagent === "string" ? ev.payload.subagent : null;

  return (
    <div
      style={{ display: "flex", gap: 12, cursor: "pointer" }}
      onClick={() => setOpen((o) => !o)}
    >
      {/* Timeline spine */}
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
            marginTop: 3,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
        {!isLast && (
          <div
            style={{
              flex: 1,
              width: 1,
              background: "var(--border)",
              marginTop: 3,
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: labelColor,
            }}
          >
            {ev.event_type}
          </span>
          {toolName && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--sky)",
              }}
            >
              {toolName}
            </span>
          )}
          {subagent && !toolName && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {subagent}
            </span>
          )}
          <span
            className="mono"
            style={{
              marginLeft: "auto",
              fontSize: 9,
              color: "var(--text-faint)",
            }}
          >
            {ts(ev.created_at)}
          </span>
        </div>

        {open && (
          <pre
            className="mono slide-down"
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 10px",
              overflow: "auto",
              maxHeight: 180,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              marginTop: 4,
            }}
          >
            {JSON.stringify(ev.payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Run detail ───────────────────────────────────────────────────────────────

function RunDetail({
  runId,
  onBack,
}: {
  runId: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"subagents" | "tools" | "events">("subagents");

  const { data: run } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.run(runId),
    refetchInterval: (q) =>
      q.state.data?.status === "running" ? 2000 : false,
  });
  const { data: events } = useQuery({
    queryKey: ["run-events", runId],
    queryFn: () => api.runEvents(runId),
    enabled: tab === "events",
    refetchInterval: () => (run?.status === "running" ? 2000 : false),
  });

  if (!run) {
    return (
      <div style={{ padding: 20 }}>
        <div
          className="shimmer"
          style={{ height: 48, borderRadius: 8, border: "1px solid var(--border-color)" }}
        />
      </div>
    );
  }

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
        <StatusBadge status={run.status} />
        <span
          className="mono"
          style={{ fontSize: 13, color: "var(--text-muted)" }}
        >
          {run.run_id}
        </span>
        <span
          className="mono"
          style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}
        >
          {elapsed(run.duration_s)}
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
          { label: "SUBAGENTS", value: run.subagents.length },
          { label: "TOOL CALLS", value: run.tool_calls.length },
          { label: "DURATION", value: elapsed(run.duration_s) },
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
              style={{
                fontSize: 32,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {s.value}
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

      {/* Result / Error banner */}
      {(run.final_answer || run.error) && (
        <div
          style={{
            margin: "0 20px 24px 20px",
            padding: "12px 16px",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            display: "flex",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {run.error ? "ERROR" : "RESULT"}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
            {run.error ?? run.final_answer}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 24,
          padding: "0 20px",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
        }}
      >
        {(["subagents", "tools", "events"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0 0 12px 0",
              background: "transparent",
              border: "none",
              color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t ? 600 : 500,
              textTransform: "capitalize",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t}
            {t === "subagents" && (
              <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>{run.subagents.length}</span>
            )}
            {t === "tools" && (
              <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>{run.tool_calls.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "subagents" && (
          run.subagents.length === 0 ? (
            <p style={{ padding: 24, color: "var(--text-faint)", fontSize: 13, textAlign: "center" }}>
              No subagents for this run.
            </p>
          ) : (
            <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 32 }}>
              {run.subagents.map((s) => (
                <div key={s.subagent_run_id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <StatusBadge status={s.status} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {s.name}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                    {s.task}
                  </p>
                  {s.result && (
                    <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, margin: 0, wordBreak: "break-word" }}>
                      {s.result}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {tab === "tools" && (
          run.tool_calls.length === 0 ? (
            <p style={{ padding: 24, color: "var(--text-faint)", fontSize: 13, textAlign: "center" }}>
              No tool calls recorded.
            </p>
          ) : (
            <div style={{ padding: "24px 20px" }}>
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "250px 1fr 100px 120px",
                  gap: 16,
                  paddingBottom: 16,
                  borderBottom: "1px solid var(--border-color)",
                  marginBottom: 16,
                }}
              >
                {["TOOL", "STATUS / ERROR", "DURATION", "TIME"].map((h) => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                    {h}
                  </span>
                ))}
              </div>
              {run.tool_calls.map((t) => (
                <div
                  key={t.tool_call_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "250px 1fr 100px 120px",
                    gap: 16,
                    padding: "8px 0",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)" }}>
                    {t.tool_name}
                  </span>
                  <span style={{ fontSize: 13, color: t.error ? "var(--red)" : "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.error ?? t.status}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {elapsed(t.duration_s)}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {ts(t.started_at)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "events" && (
          events === undefined ? (
            <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="shimmer" style={{ height: 28, borderRadius: 6 }} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p style={{ padding: 24, color: "var(--text-faint)", fontSize: 13, textAlign: "center" }}>
              No events yet.
            </p>
          ) : (
            <div style={{ padding: "24px 20px" }}>
              {events.map((ev, i) => (
                <EventTimelineRow key={ev.event_id} ev={ev} isLast={i === events.length - 1} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function RunsPanel() {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: runs, isLoading } = useQuery({
    queryKey: ["runs", statusFilter],
    queryFn: () =>
      api.runs({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
      }),
    refetchInterval: 5000,
  });

  const filters = ["all", "running", "completed", "failed"];

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
          {filters.map((f) => {
            const isActive = statusFilter === f;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{
                  padding: "6px 20px",
                  borderRadius: 999, /* Pill shape */
                  border: "none",
                  background: isActive ? "var(--bg-color)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: isActive ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  textTransform: "capitalize",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  fontFamily: "inherit",
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
        {runs && (
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}
          >
            {runs.length} runs
          </span>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {isLoading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="shimmer"
                style={{
                  height: 64,
                  borderBottom: "1px solid var(--border)",
                }}
              />
            ))
          : !runs || runs.length === 0
            ? (
              <p
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: "var(--text-faint)",
                  fontSize: 12,
                }}
              >
                No runs found.
              </p>
            )
            : runs.map((r) => (
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

export function RunDetailPanel() {
  const navigate = useNavigate();
  const { runId } = useParams({ from: "/runs/$runId" });

  return <RunDetail runId={runId} onBack={() => navigate({ to: "/runs" })} />;
}
