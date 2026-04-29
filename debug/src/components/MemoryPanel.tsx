import { useState, useMemo, lazy, Suspense, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Claim } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

const MemoryGraph = lazy(() => import("./MemoryGraph"));

// ── Constants ────────────────────────────────────────────────────────────────

const TIER_STYLE: Record<string, { color: string; bg: string }> = {
  short_term: { color: "var(--sky)", bg: "var(--sky-bg)" },
  long_term:  { color: "var(--violet)", bg: "var(--violet-bg)" },
  permanent:  { color: "var(--amber)", bg: "var(--amber-bg)" },
};

const SEGMENT_COLOR: Record<string, string> = {
  core_identity: "var(--rose)",
  preference:    "var(--teal)",
  relationship:  "var(--accent)",
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
    pct >= 75 ? "var(--green)" : pct >= 45 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 60,
          height: 3,
          background: "var(--border-color)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
      <span
        className="mono"
        style={{ fontSize: 10, color: "var(--text-muted)", width: 26 }}
      >
        {pct}%
      </span>
    </div>
  );
}

function ClaimRow({ claim }: { claim: Claim }) {
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_STYLE[claim.tier] ?? { color: "var(--text-muted)", bg: "transparent" };
  const segColor = SEGMENT_COLOR[claim.segment] ?? "var(--text-muted)";

  return (
    <div
      onClick={() => setExpanded((o) => !o)}
      style={{
        borderBottom: "1px solid var(--border-color)",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = "var(--button-bg)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = "transparent")
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 90px 90px 80px 90px",
          gap: 12,
          padding: "10px 16px",
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: expanded ? "unset" : "ellipsis",
              whiteSpace: expanded ? "normal" : "nowrap",
              lineHeight: 1.5,
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
                gap: "4px 16px",
                marginTop: 8,
              }}
            >
              <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {claim.claim_id.slice(0, 18)}…
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                class: {claim.memory_class}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                accessed: {claim.access_count}×
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                trust: {(claim.trust_score * 100).toFixed(0)}%
              </span>
              {claim.user_confirmed && (
                <span
                  style={{ fontSize: 10, color: "var(--green)", fontWeight: 700 }}
                >
                  ✓ confirmed
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
            padding: "2px 7px",
            borderRadius: 5,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: tier.bg,
            color: tier.color,
          }}
        >
          {claim.tier.replace("_", "-")}
        </span>

        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: segColor,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {claim.segment}
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
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-color)",
        flexShrink: 0,
      }}
    >
      {/* Tier donut proxy — stacked bar */}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", height: 5, borderRadius: 4, overflow: "hidden", gap: 1 }}>
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
                minWidth: (tierMap[tier] ?? 0) > 0 ? 3 : 0,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {[
            { tier: "short_term", label: "Short-term", color: "var(--sky)" },
            { tier: "long_term",  label: "Long-term",  color: "var(--violet)" },
            { tier: "permanent",  label: "Permanent",  color: "var(--amber)" },
          ].map(({ tier, label, color }) => (
            <div
              key={tier}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
              <span
                className="mono"
                style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}
              >
                {tierMap[tier] ?? 0}
              </span>
            </div>
          ))}
          <span
            className="mono"
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "var(--accent)",
              fontWeight: 700,
            }}
          >
            avg conf {(data.avg_confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function MemoryInitModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [linkedinText, setLinkedinText] = useState("");
  const [googleProfileText, setGoogleProfileText] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const queueProfileText = async () => {
    if (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim()) {
      setStatus("Add LinkedIn, Google profile, or notes first.");
      return;
    }
    setBusyAction("profile");
    setStatus("");
    try {
      const result = await api.ingestProfile({
        linkedin_text: linkedinText.trim() || undefined,
        google_profile_text: googleProfileText.trim() || undefined,
        notes: notes.trim() || undefined,
        default_trust_level: 8,
      });
      setStatus(`Queued ${result.sources ?? 0} profile source${(result.sources ?? 0) === 1 ? "" : "s"}.`);
    } catch (err) {
      setStatus(`Profile ingest failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const queueLinkedInMe = async () => {
    setBusyAction("linkedin-me");
    setStatus("");
    try {
      const result = await api.ingestComposioLinkedInMe({ ingest: true, trust_level: 9 });
      const claims = result.ingestion?.claims_created ?? 0;
      setStatus(`LinkedIn imported via ${result.tool_name}. ${claims > 0 ? `${claims} claims created.` : "Memory ingest queued."}`);
    } catch (err) {
      setStatus(`LinkedIn import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const queueAeroLeads = async () => {
    if (!linkedInUrl.trim()) {
      setStatus("Enter a LinkedIn URL first.");
      return;
    }
    setBusyAction("aeroleads");
    setStatus("");
    try {
      const result = await api.ingestAeroLeadsLinkedIn({
        linkedin_url: linkedInUrl.trim(),
        ingest: true,
        trust_level: 7,
      });
      const claims = result.ingestion?.claims_created ?? 0;
      setStatus(`AeroLeads imported via ${result.tool_name}. ${claims > 0 ? `${claims} claims created.` : "Memory ingest queued."}`);
    } catch (err) {
      setStatus(`AeroLeads import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const uploadDocument = async (file: File | null) => {
    if (!file) return;
    setBusyAction("document");
    setStatus("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source_type", "profile_document");
      formData.append("trust_level", "8");
      formData.append("title", file.name);
      const result = await api.ingestProfileDocument(formData);
      setStatus(`Queued document ingest for ${result.filename ?? file.name}.`);
    } catch (err) {
      setStatus(`Document upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setBusyAction(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent style={{ maxWidth: 720 }}>
        <DialogHeader>
          <DialogTitle>Add Memory</DialogTitle>
          <DialogDescription>
            Enrich your profile memory graph. Choose a direct import method or paste data manually.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "grid", gap: 20, marginTop: 8 }}>
          {/* Quick Actions Row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "16px", background: "var(--bg-color)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <div style={{ width: "100%", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              1-Click Imports
            </div>
            <button
              type="button"
              onClick={queueLinkedInMe}
              disabled={busyAction !== null}
              style={{ ...actionButtonStyle(busyAction === "linkedin-me"), display: "flex", alignItems: "center", gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
              {busyAction === "linkedin-me" ? "Importing…" : "Import LinkedIn"}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busyAction !== null}
              style={{ ...secondaryButtonStyle, display: "flex", alignItems: "center", gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
              {busyAction === "document" ? "Uploading…" : "Upload Document"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) => void uploadDocument(e.target.files?.[0] ?? null)}
            />
          </div>

          <div style={{ width: "100%", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>
            Manual Entry
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>LinkedIn Bio / Experience</span>
              <textarea
                value={linkedinText}
                onChange={(e) => setLinkedinText(e.target.value)}
                placeholder="Paste your LinkedIn summary, work experience, or skills here..."
                style={textareaStyle}
              />
            </label>
            <div style={{ display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Google Profile / General Notes</span>
                <textarea
                  value={googleProfileText}
                  onChange={(e) => setGoogleProfileText(e.target.value)}
                  placeholder="Paste account details, bio, or any other relevant profile info..."
                  style={{ ...textareaStyle, minHeight: 50 }}
                />
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Extra Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything else the memory graph should know..."
                  style={{ ...textareaStyle, minHeight: 50 }}
                />
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "16px", background: "var(--bg-color)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            <input
              type="url"
              value={linkedInUrl}
              onChange={(e) => setLinkedInUrl(e.target.value)}
              placeholder="https://linkedin.com/in/username (for AeroLeads enrich)"
              style={{
                flex: 1,
                minWidth: 200,
                padding: "8px 12px",
                background: "var(--input-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--accent-color)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border-color)"}
            />
            <button 
              type="button"
              onClick={queueAeroLeads} 
              disabled={busyAction !== null || !linkedInUrl.trim()} 
              style={{
                ...secondaryButtonStyle,
                opacity: linkedInUrl.trim() ? 1 : 0.5,
                cursor: linkedInUrl.trim() ? "pointer" : "not-allowed"
              }}
            >
              {busyAction === "aeroleads" ? "Enriching…" : "Enrich URL"}
            </button>
          </div>

          {status && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: status.toLowerCase().includes("failed") ? "var(--status-disconnected-bg)" : "var(--status-connected-bg)", fontSize: 13, fontWeight: 500, color: status.toLowerCase().includes("failed") ? "var(--status-disconnected-text)" : "var(--status-connected-text)" }}>
              {status}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
          <button 
            type="button"
            onClick={onClose} 
            style={{ ...secondaryButtonStyle, padding: "10px 20px" }}
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={queueProfileText} 
            disabled={busyAction !== null || (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim())} 
            style={{
              ...actionButtonStyle(busyAction === "profile"),
              padding: "10px 24px",
              opacity: (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim()) ? 0.5 : 1,
              cursor: (!linkedinText.trim() && !googleProfileText.trim() && !notes.trim()) ? "not-allowed" : "pointer"
            }}
          >
            {busyAction === "profile" ? "Queueing…" : "Save Text Entries"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const textareaStyle: CSSProperties = {
  minHeight: 110,
  resize: "vertical",
  padding: "10px 12px",
  background: "var(--input-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontSize: 12,
  fontFamily: "inherit",
  lineHeight: 1.5,
};

function actionButtonStyle(active: boolean): CSSProperties {
  return {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--accent-color)",
    background: active ? "var(--accent-glow)" : "var(--accent-color)",
    color: active ? "var(--accent-color)" : "#fff",
    fontSize: 12,
    fontWeight: 500,
    cursor: active ? "wait" : "pointer",
    transition: "all 0.2s",
  };
}

const secondaryButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "var(--button-bg)",
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.2s",
};

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
      <MemoryStatsBar allClaims={claims ?? []} />

      {/* Toolbar */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-color)",
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
                  padding: "6px 20px",
                  borderRadius: 999, /* Pill shape */
                  border: "none",
                  background: isActive ? "var(--bg-color)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: isActive ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
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
