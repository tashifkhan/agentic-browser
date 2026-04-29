import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Claim } from "../lib/api";

const SEGMENT_COLORS: Record<string, string> = {
  core_identity: "#fb7185",
  preference:    "#2dd4bf",
  relationship:  "#e879a0",
  project:       "#fb923c",
  knowledge:     "#38bdf8",
  context:       "#6b7280",
  professional:  "#a78bfa",
  skill:         "#4ade80",
};

const TIER_COLOR: Record<string, string> = {
  permanent:  "#fbbf24",
  long_term:  "#a78bfa",
  short_term: "#38bdf8",
};

function segColor(segment: string): string {
  return SEGMENT_COLORS[segment] ?? "#64748b";
}

function buildGraph(claims: Claim[], segFilter: string) {
  const visible = segFilter === "all" ? claims : claims.filter((c) => c.segment === segFilter);
  const bySegment = new Map<string, Claim[]>();
  for (const c of visible) {
    const seg = c.segment || "context";
    const list = bySegment.get(seg);
    if (list) list.push(c);
    else bySegment.set(seg, [c]);
  }

  const nodes: any[] = [];
  const links: any[] = [];

  for (const [segment, members] of bySegment) {
    const hubId = `hub:${segment}`;
    nodes.push({
      id: hubId,
      kind: "hub",
      label: segment.replace(/_/g, " "),
      count: members.length,
      segment,
      color: segColor(segment),
    });
    for (const m of members) {
      nodes.push({
        id: m.claim_id,
        kind: "claim",
        label: m.claim_text.slice(0, 60) + (m.claim_text.length > 60 ? "…" : ""),
        fullText: m.claim_text,
        segment: m.segment,
        tier: m.tier,
        confidence: m.confidence,
        color: segColor(m.segment),
        claim: m,
      });
      links.push({ source: hubId, target: m.claim_id });
    }
  }

  return { nodes, links };
}

export default function MemoryGraph({ claims }: { claims: Claim[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [selected, setSelected] = useState<any>(null);
  const [segFilter, setSegFilter] = useState("all");
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.max(width, 200), h: Math.max(height, 200) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => buildGraph(claims, segFilter), [claims, segFilter]);

  const segments = useMemo(() => {
    const seen = new Set<string>();
    for (const c of claims) if (c.segment) seen.add(c.segment);
    return Array.from(seen).sort();
  }, [claims]);

  const handleNodeClick = useCallback((node: any) => {
    if (node.kind === "claim") setSelected(node);
    else setSelected(null);
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    setHovered(node?.id ?? null);
  }, []);

  if (claims.length === 0) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.15 }}>◎</div>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
          No memory claims yet.
        </span>
        <span style={{ fontSize: 10, color: "var(--text-faint)", opacity: 0.6 }}>
          Claims will appear here as the agent builds memory.
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <ForceGraph2D
        ref={fgRef}
        width={dims.w}
        height={dims.h}
        graphData={graph}
        backgroundColor="#0a0a0a"
        nodeRelSize={4}
        linkColor={(link: any) => {
          const srcId = typeof link.source === "object" ? link.source.id : link.source;
          return srcId === hovered || link.target === hovered
            ? "rgba(255,255,255,0.25)"
            : "rgba(255,255,255,0.05)";
        }}
        linkWidth={1}
        nodeLabel={() => ""}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const isHub = node.kind === "hub";
          const isSelected = selected?.id === node.id;
          const isHov = hovered === node.id;
          const color = node.color ?? "#64748b";

          if (isHub) {
            const radius = Math.max(10, Math.min(28, 8 + Math.log2(node.count + 1) * 4));

            // Glow
            ctx.save();
            ctx.globalAlpha = isHov ? 0.35 : 0.18;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Hub circle
            ctx.globalAlpha = isHov ? 1 : 0.88;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Count badge
            const fontSize = Math.max(8, Math.min(12, 11 / globalScale));
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${fontSize}px "Outfit", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(node.label, node.x, node.y - fontSize * 0.1);

            // Count sub-label
            if (globalScale > 0.5) {
              ctx.fillStyle = "rgba(255,255,255,0.6)";
              ctx.font = `${Math.max(6, 9 / globalScale)}px "Outfit", sans-serif`;
              ctx.fillText(`${node.count}`, node.x, node.y + fontSize * 0.9);
            }
          } else {
            const radius = Math.max(2.5, Math.min(8, 2.5 + (node.confidence ?? 0.5) * 5.5));
            const tierRingColor = TIER_COLOR[node.tier] ?? "#64748b";

            ctx.globalAlpha = isSelected || isHov ? 1 : 0.7;

            // Tier ring
            ctx.strokeStyle = tierRingColor;
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.globalAlpha = isSelected ? 0.9 : isHov ? 0.7 : 0.4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 2, 0, Math.PI * 2);
            ctx.stroke();

            // Fill
            ctx.globalAlpha = isSelected || isHov ? 1 : 0.7;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Selected glow
            if (isSelected) {
              ctx.save();
              ctx.globalAlpha = 0.3;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius * 2.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }

            if (globalScale > 1.8) {
              ctx.fillStyle = "rgba(200,200,200,0.85)";
              ctx.font = `${9 / globalScale}px "Outfit", sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText(node.label.slice(0, 40), node.x, node.y + radius + 2);
            }
          }
        }}
        d3AlphaDecay={0.025}
        d3VelocityDecay={0.35}
        cooldownTicks={100}
      />

      {/* Segment filter pills */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
          maxWidth: 260,
        }}
      >
        {["all", ...segments].map((seg) => {
          const active = segFilter === seg;
          const color = seg === "all" ? "var(--accent)" : segColor(seg);
          return (
            <button
              key={seg}
              onClick={() => setSegFilter(seg)}
              style={{
                padding: "3px 9px",
                borderRadius: 99,
                border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
                background: active ? `${color}22` : "rgba(10,10,10,0.7)",
                color: active ? color : "var(--text-faint)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: active ? 700 : 400,
                letterSpacing: "0.03em",
                backdropFilter: "blur(4px)",
                transition: "all 0.12s",
              }}
            >
              {seg === "all" ? "All" : seg.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>

      {/* Tier legend */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          background: "rgba(10,10,10,0.82)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
          backdropFilter: "blur(6px)",
        }}
      >
        <div className="section-label" style={{ marginBottom: 2 }}>Tier</div>
        {[
          { tier: "permanent", label: "Permanent" },
          { tier: "long_term", label: "Long-term" },
          { tier: "short_term", label: "Short-term" },
        ].map(({ tier, label }) => (
          <div key={tier} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: `1.5px solid ${TIER_COLOR[tier]}`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Segment color legend */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: "5px 12px",
          maxWidth: 220,
          background: "rgba(10,10,10,0.82)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
          backdropFilter: "blur(6px)",
        }}
      >
        <div className="section-label" style={{ width: "100%", marginBottom: 2 }}>Segments</div>
        {Object.entries(SEGMENT_COLORS)
          .filter(([seg]) => segments.includes(seg))
          .map(([seg, color]) => (
            <div key={seg} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>
                {seg.replace(/_/g, " ")}
              </span>
            </div>
          ))}
      </div>

      {/* Selected claim detail panel */}
      {selected && (
        <div
          className="fade-in"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 260,
            background: "rgba(14,14,14,0.94)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 14px",
            backdropFilter: "blur(8px)",
            boxShadow: `0 0 24px ${segColor(selected.segment)}33`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: segColor(selected.segment),
              }}
            >
              {selected.segment?.replace(/_/g, " ")}
            </span>
            <button
              onClick={() => setSelected(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-faint)",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            {selected.fullText}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              {
                label: "Tier",
                value: selected.tier?.replace(/_/g, "-"),
                color: TIER_COLOR[selected.tier] ?? "var(--text-muted)",
              },
              {
                label: "Confidence",
                value: `${Math.round((selected.confidence ?? 0) * 100)}%`,
                color:
                  (selected.confidence ?? 0) >= 0.75
                    ? "var(--green)"
                    : (selected.confidence ?? 0) >= 0.45
                      ? "var(--amber)"
                      : "var(--red)",
              },
              {
                label: "Class",
                value: selected.claim?.memory_class ?? "—",
                color: "var(--text-muted)",
              },
              {
                label: "Accessed",
                value: `${selected.claim?.access_count ?? 0}×`,
                color: "var(--text-muted)",
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{label}</span>
                <span className="mono" style={{ fontSize: 11, fontWeight: 700, color }}>
                  {value}
                </span>
              </div>
            ))}
            {selected.claim?.user_confirmed && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  color: "var(--green)",
                  fontWeight: 700,
                  textAlign: "right",
                }}
              >
                ✓ user confirmed
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
