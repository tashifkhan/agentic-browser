import { useState, useMemo, lazy, Suspense, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Claim } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { MemoryInitModal } from "./MemoryInitModal";

const MemoryGraph = lazy(() => import("./MemoryGraph"));

// ── Constants ────────────────────────────────────────────────────────────────

const TIER_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  short_term: { color: "var(--sky)", bg: "rgba(2, 132, 199, 0.1)", border: "rgba(2, 132, 199, 0.2)" },
  long_term:  { color: "var(--violet)", bg: "rgba(124, 58, 237, 0.1)", border: "rgba(124, 58, 237, 0.2)" },
  permanent:  { color: "var(--amber)", bg: "rgba(217, 119, 6, 0.1)", border: "rgba(217, 119, 6, 0.2)" },
};

const SEGMENT_COLOR: Record<string, string> = {
  core_identity: "var(--rose)",
  preference:    "var(--teal)",
  relationship:  "var(--accent-color)",
  project:       "var(--orange)",
  knowledge:     "var(--sky)",
  context:       "var(--text-muted)",
  professional:  "var(--violet)",
  skill:         "var(--green)",
};

// ── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75 ? "var(--green)" : pct >= 45 ? "var(--amber)" : "var(--rose)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 72,
          height: 6,
          background: "var(--input-bg)",
          borderRadius: 999,
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)"
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 999,
            boxShadow: `0 0 8px ${color}80`
          }}
        />
      </div>
      <span
        className="mono"
        style={{ fontSize: 11, color: "var(--text-primary)", width: 30, fontWeight: 500 }}
      >
        {pct}%
      </span>
    </div>
  );
}

function ClaimRow({ claim }: { claim: Claim }) {
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_STYLE[claim.tier] ?? { color: "var(--text-muted)", bg: "transparent", border: "transparent" };
  const segColor = SEGMENT_COLOR[claim.segment] ?? "var(--text-muted)";

  return (
    <div
      onClick={() => setExpanded((o) => !o)}
      style={{
        borderBottom: "1px solid var(--border-color)",
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--input-bg)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 100px 100px 100px 90px",
          gap: 16,
          padding: "16px 20px",
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: expanded ? 500 : 400,
              color: expanded ? "var(--text-primary)" : "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: expanded ? "unset" : "ellipsis",
              whiteSpace: expanded ? "normal" : "nowrap",
              lineHeight: 1.5,
              transition: "all 0.2s",
            }}
          >
            {claim.claim_text}
          </p>
          {expanded && (
            <div
              className="slide-down"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px 20px",
                marginTop: 12,
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {claim.claim_id.slice(0, 18)}…
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                Class: <span style={{color: "var(--text-primary)"}}>{claim.memory_class}</span>
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                Accessed: <span style={{color: "var(--text-primary)"}}>{claim.access_count}×</span>
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                Trust: <span style={{color: "var(--text-primary)"}}>{(claim.trust_score * 100).toFixed(0)}%</span>
              </span>
              {claim.user_confirmed && (
                <span
                  style={{ fontSize: 11, color: "var(--status-connected-text)", fontWeight: 600, background: "var(--status-connected-bg)", padding: "2px 8px", borderRadius: 6 }}
                >
                  ✓ Confirmed
                </span>
              )}
            </div>
          )}
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            background: tier.bg,
            color: tier.color,
            border: `1px solid ${tier.border}`
          }}
        >
          {claim.tier.replace("_", "-")}
        </span>

        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: segColor,
            textTransform: "capitalize",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "0.02em",
          }}
        >
          {claim.segment.replace(/_/g, " ")}
        </span>

        <ConfidenceBar value={claim.confidence} />

        <span
          className="mono"
          style={{ fontSize: 10, color: "var(--text-muted)" }}
        >
          {claim.created_at
            ? new Date(claim.created_at).toLocaleDateString()
            : "—"}
        </span>
      </div>
    </div>
  );
}

// ── Stats bar ────────────────────────────────────────────────────────────────

function MemoryStatsBar(_: { allClaims: Claim[] }) {
  const { data } = useQuery({
    queryKey: ["memory-stats"],
    queryFn: api.memoryStats,
    refetchInterval: 15000,
  });
  if (!data) return null;

  const tierMap: Record<string, number> = {};
  for (const r of data.by_tier_status) {
    if (r.status === "active") tierMap[r.tier] = (tierMap[r.tier] ?? 0) + r.count;
  }
  const total = Object.values(tierMap).reduce((a, b) => a + b, 0);

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        padding: "24px",
        background: "var(--card-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border-color)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", gap: 2 }}>
          {[
            { tier: "short_term", color: "var(--sky)" },
            { tier: "long_term", color: "var(--violet)" },
            { tier: "permanent", color: "var(--amber)" },
          ].map(({ tier, color }) => (
            <div
              key={tier}
              style={{
                flex: (tierMap[tier] ?? 0) / Math.max(total, 1),
                background: color,
                minWidth: (tierMap[tier] ?? 0) > 0 ? 4 : 0,
                boxShadow: `inset 0 1px 2px rgba(255,255,255,0.2)`
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          {[
            { tier: "short_term", label: "Short-term", color: "var(--sky)" },
            { tier: "long_term",  label: "Long-term",  color: "var(--violet)" },
            { tier: "permanent",  label: "Permanent",  color: "var(--amber)" },
          ].map(({ tier, label, color }) => (
            <div
              key={tier}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  boxShadow: `0 0 8px ${color}80`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
              <span
                className="mono"
                style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}
              >
                {tierMap[tier] ?? 0}
              </span>
            </div>
          ))}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 13,
              color: "var(--accent-color)",
              fontWeight: 700,
              letterSpacing: "0.02em",
              background: "var(--accent-glow-soft)",
              padding: "4px 12px",
              borderRadius: 999,
              border: "1px solid var(--accent-glow)"
            }}
          >
            Avg Confidence: {(data.avg_confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}



// ── Main panel ───────────────────────────────────────────────────────────────

export function MemoryPanel() {
  const [viewMode, setViewMode] = useState<"table" | "graph">("table");
  const [tierFilter, setTierFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [isInitModalOpen, setIsInitModalOpen] = useState(false);
  const PAGE = 60;

  const { data: claims, isLoading } = useQuery({
    queryKey: ["claims", tierFilter, page],
    queryFn: () =>
      api.claims({
        tier: tierFilter === "all" ? undefined : tierFilter,
        limit: viewMode === "graph" ? 500 : PAGE,
        offset: viewMode === "graph" ? 0 : page * PAGE,
      }),
    refetchInterval: 15000,
  });

  const filtered = useMemo(() => {
    if (!claims) return [];
    if (!search.trim()) return claims;
    const q = search.toLowerCase();
    return claims.filter(
      (c) =>
        c.claim_text.toLowerCase().includes(q) ||
        c.segment.toLowerCase().includes(q) ||
        c.memory_class.toLowerCase().includes(q)
    );
  }, [claims, search]);

  const tiers = [
    { id: "all", label: "All" },
    { id: "short_term", label: "Short-term" },
    { id: "long_term", label: "Long-term" },
    { id: "permanent", label: "Permanent" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Top Header Action - Extends into the main App header using negative margin/positioning */}
      <button
        onClick={() => setIsInitModalOpen(true)}
        style={{
          position: "absolute",
          top: -48,
          right: 30,
          zIndex: 100,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          background: "linear-gradient(135deg, var(--accent-color), var(--accent-color-deep))",
          color: "white",
          border: "none",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.02em",
          boxShadow: "0 4px 12px var(--accent-glow)",
          cursor: "pointer",
          transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 16px var(--accent-glow)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 4px 12px var(--accent-glow)";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Add Memory
      </button>

      <MemoryInitModal isOpen={isInitModalOpen} onClose={() => setIsInitModalOpen(false)} />
      {viewMode === "table" && <MemoryStatsBar allClaims={claims ?? []} />}

      {/* Toolbar */}
      <div
        style={{
          position: viewMode === "graph" ? "absolute" : "relative",
          top: viewMode === "graph" ? 20 : 0,
          right: viewMode === "graph" ? 32 : 0,
          zIndex: 100,
          padding: viewMode === "graph" ? 0 : "10px 16px",
          borderBottom: viewMode === "graph" ? "none" : "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* View toggle */}
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
          {(["table", "graph"] as const).map((m) => {
            const isActive = viewMode === m;
            return (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  padding: "8px 24px",
                  borderRadius: 999, /* Pill shape */
                  border: "none",
                  background: isActive ? "var(--bg-color)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>

        {viewMode === "table" && (
          <>
            {/* Tier filters */}
            {tiers.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTierFilter(t.id); setPage(0); }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor:
                    tierFilter === t.id
                      ? TIER_STYLE[t.id]?.color ?? "var(--accent)"
                      : "var(--border-color)",
                  background:
                    tierFilter === t.id
                      ? TIER_STYLE[t.id]?.bg ?? "var(--accent-glow)"
                      : "transparent",
                  color:
                    tierFilter === t.id
                      ? TIER_STYLE[t.id]?.color ?? "var(--accent)"
                      : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                  transition: "all 0.12s",
                }}
              >
                {t.label}
              </button>
            ))}

            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search claims…"
              style={{
                flex: 1,
                minWidth: 160,
                padding: "5px 10px",
                background: "var(--input-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                color: "var(--text-secondary)",
                fontSize: 12,
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) =>
                ((e.currentTarget as HTMLInputElement).style.borderColor =
                  "var(--accent)")
              }
              onBlur={(e) =>
                ((e.currentTarget as HTMLInputElement).style.borderColor =
                  "var(--border-color)")
              }
            />

            <span
              className="mono"
              style={{ fontSize: 10, color: "var(--text-muted)" }}
            >
              {filtered.length}
              {search ? `/${claims?.length ?? 0}` : ""}
            </span>
          </>
        )}
      </div>

      {/* Graph view */}
      {viewMode === "graph" && (
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
          {isLoading ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                Loading memory graph…
              </span>
            </div>
          ) : (
            <Suspense
              fallback={
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Loading graph…
                  </span>
                </div>
              }
            >
              <MemoryGraph claims={claims ?? []} />
            </Suspense>
          )}
        </div>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <>
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 90px 80px 90px",
              gap: 12,
              padding: "6px 16px",
              borderBottom: "1px solid var(--border-color)",
              background: "var(--bg-color)",
              flexShrink: 0,
            }}
          >
            {["Claim", "Tier", "Segment", "Confidence", "Date"].map((h) => (
              <span key={h} className="section-label">
                {h}
              </span>
            ))}
          </div>

          <div style={{ flex: 1, overflow: "auto" }}>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="shimmer"
                    style={{
                      height: 44,
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  />
                ))
              : filtered.length === 0
                ? claims?.length === 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      padding: 40,
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        background: "var(--accent-glow)",
                        color: "var(--accent-color)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 24,
                      }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                      </svg>
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.01em" }}>
                      Memory Bank is empty
                    </h3>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 360, lineHeight: 1.6, marginBottom: 24 }}>
                      Start building your profile memory by adding Google account details, LinkedIn information, notes, or uploading documents.
                    </p>
                    <button
                      onClick={() => setIsInitModalOpen(true)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 24px",
                        background: "var(--button-bg)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--button-hover)";
                        e.currentTarget.style.borderColor = "var(--border-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--button-bg)";
                        e.currentTarget.style.borderColor = "var(--border-color)";
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      Add First Memory
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 48,
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      No claims match your current filters.
                    </p>
                  </div>
                )
                : filtered.map((c) => <ClaimRow key={c.claim_id} claim={c} />)}
          </div>

          {/* Pagination */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "transparent",
                color: page === 0 ? "var(--text-muted)" : "var(--text-muted)",
                cursor: page === 0 ? "not-allowed" : "pointer",
                fontSize: 11,
              }}
            >
              ← Prev
            </button>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Page {page + 1}
            </span>
            <button
              disabled={(claims?.length ?? 0) < PAGE}
              onClick={() => setPage((p) => p + 1)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "transparent",
                color:
                  (claims?.length ?? 0) < PAGE
                    ? "var(--text-muted)"
                    : "var(--text-muted)",
                cursor:
                  (claims?.length ?? 0) < PAGE ? "not-allowed" : "pointer",
                fontSize: 11,
              }}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
