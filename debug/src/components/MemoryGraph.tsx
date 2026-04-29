import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Claim } from "../lib/api";

const SEGMENT_COLORS: Record<string, string> = {
  core_identity: "#f43f5e", // rose
  preference:    "#2dd4bf", // teal
  relationship:  "#3b82f6", // blue
  project:       "#fb923c", // orange
  knowledge:     "#0ea5e9", // sky
  context:       "#71717a", // muted
  professional:  "#a78bfa", // violet
  skill:         "#34d399", // green
  behavioral:    "#6366f1", // indigo
  correction:    "#fbbf24", // amber
  identity:      "#f43f5e", // rose
};

function segColor(segment: string): string {
  return SEGMENT_COLORS[segment?.toLowerCase()] ?? "#94a3b8";
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

  const segmentNodes = Array.from(bySegment.keys());

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

  // Interconnect hubs softly to keep them grouped
  for (let i = 0; i < segmentNodes.length; i++) {
    for (let j = i + 1; j < segmentNodes.length; j++) {
      links.push({
        source: `hub:${segmentNodes[i]}`,
        target: `hub:${segmentNodes[j]}`,
        isHubLink: true
      });
    }
  }

  return { nodes, links };
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(
    (document.documentElement.getAttribute("data-theme") as "light" | "dark" | null) ?? "dark"
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme((document.documentElement.getAttribute("data-theme") as "light" | "dark" | null) ?? "dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export default function MemoryGraph({ claims }: { claims: Claim[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [selected, setSelected] = useState<any>(null);
  const [expandedHub, setExpandedHub] = useState<string | null>(null);
  const [segFilter, setSegFilter] = useState("all");
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useTheme();

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
    if (node.kind === "claim") {
      setSelected(node);
      // Zoom to the selected claim slightly
      if (fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 800);
        fgRef.current.zoom(2.5, 800);
      }
    } else if (node.kind === "hub") {
      if (expandedHub === node.id) {
        setExpandedHub(null);
        if (fgRef.current) {
          fgRef.current.zoomToFit(800, 40);
        }
      } else {
        setExpandedHub(node.id);
        if (fgRef.current) {
          fgRef.current.centerAt(node.x, node.y, 800);
          fgRef.current.zoom(2, 800);
        }
      }
      setSelected(null);
    }
  }, [expandedHub]);

  const handleBgClick = useCallback(() => {
    setSelected(null);
    setExpandedHub(null);
    if (fgRef.current) fgRef.current.zoomToFit(800, 40);
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    setHovered(node?.id ?? null);
  }, []);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force("charge").strength((node: any) => {
        if (node.kind === "hub") {
          return expandedHub === node.id ? -100 : -1000;
        }
        const isPartOfExpanded = expandedHub === `hub:${node.segment}`;
        return isPartOfExpanded ? 0 : -25;
      });
      
      fgRef.current.d3Force("link").distance((link: any) => {
        if (link.isHubLink) return 400;
        return 45; // default close orbit
      }).strength((link: any) => link.isHubLink ? 0.05 : 0.8);
      
      // Custom force to arrange children in a perfect circle around the expanded hub
      fgRef.current.d3Force('radialCircle', (alpha: number) => {
        if (!expandedHub) return;
        const nodes = graph.nodes;
        const hub = nodes.find(n => n.id === expandedHub);
        if (!hub) return;
        
        const children = nodes.filter(n => n.kind === 'claim' && `hub:${n.segment}` === expandedHub);
        const radius = Math.max(140, children.length * 8);
        
        children.forEach((child, i) => {
          const targetAngle = (i / children.length) * 2 * Math.PI - Math.PI/2;
          const targetX = hub.x + Math.cos(targetAngle) * radius;
          const targetY = hub.y + Math.sin(targetAngle) * radius;
          
          child.vx += (targetX - child.x) * alpha * 1.5;
          child.vy += (targetY - child.y) * alpha * 1.5;
        });
      });

      fgRef.current.d3ReheatSimulation();
    }
  }, [graph, expandedHub]);

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
          background: "var(--bg-color)"
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.15 }}>◎</div>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No memory claims yet.
        </span>
      </div>
    );
  }

  const isLight = theme === "light";
  const bgColor = isLight ? "#fafafa" : "#09090b";
  const lineColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
  const hubLineColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const textColorPrimary = isLight ? "#09090b" : "#ffffff";
  const textColorMuted = isLight ? "#71717a" : "#a1a1aa";
  const nodeOutline = isLight ? "#ffffff" : "#09090b";

  const numClusters = segments.length;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", background: bgColor, fontFamily: "var(--font-main)" }}>
      
      {/* Top Left Stats - Premium Typography */}
      <div style={{ position: "absolute", top: 32, left: 32, zIndex: 10, pointerEvents: "none" }}>
        <h2 style={{ 
          fontFamily: "var(--font-display)", 
          fontSize: 24, 
          fontWeight: 600, 
          color: textColorPrimary, 
          margin: 0, 
          letterSpacing: "-0.02em" 
        }}>
          {claims.length} memories <span style={{ color: textColorMuted, fontWeight: 400 }}>/ {numClusters} clusters</span>
        </h2>
        {expandedHub && (
          <p className="fade-in" style={{ margin: "4px 0 0", color: "var(--accent-color)", fontSize: 13, fontWeight: 500, letterSpacing: "0.02em" }}>
            Viewing: {expandedHub.replace("hub:", "").replace(/_/g, " ")}
          </p>
        )}
      </div>

      <ForceGraph2D
        ref={fgRef}
        width={dims.w}
        height={dims.h}
        graphData={graph}
        backgroundColor={bgColor}
        nodeRelSize={4}
        linkWidth={(link: any) => {
          const isHov = hovered === link.source?.id || hovered === link.target?.id;
          return isHov ? 1.5 : 1;
        }}
        linkLineDash={(link: any) => link.isHubLink ? [4, 8] : [0, 0]}
        linkColor={(link: any) => {
          const isHov = hovered === link.source?.id || hovered === link.target?.id;
          
          let color = link.isHubLink ? hubLineColor : lineColor;
          
          // Fade out links not related to expanded hub
          if (expandedHub) {
            const isRelated = link.source?.id === expandedHub || link.target?.id === expandedHub || link.source?.segment === expandedHub.replace("hub:", "") || link.target?.segment === expandedHub.replace("hub:", "");
            if (!isRelated) {
              color = isLight ? "rgba(0,0,0,0.01)" : "rgba(255,255,255,0.01)";
            } else if (link.isHubLink) {
              color = isLight ? "rgba(0,0,0,0.01)" : "rgba(255,255,255,0.01)";
            } else {
              // faint radial lines for the circle
              color = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";
            }
          }
          
          if (isHov) {
            // Darker/stronger line on hover
            color = isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.3)";
          }
          
          return color;
        }}
        nodeLabel={() => ""}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBgClick}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const isHub = node.kind === "hub";
          const isSelected = selected?.id === node.id;
          const isHov = hovered === node.id;
          const isExpandedHub = expandedHub === node.id;
          const isPartOfExpanded = expandedHub === `hub:${node.segment}`;
          const color = node.color ?? "#71717a";

          // Calculate opacity based on expansion state
          let alpha = 1;
          if (expandedHub && !isExpandedHub && !isPartOfExpanded) {
            alpha = 0.1;
          } else if (expandedHub && isPartOfExpanded) {
            alpha = 1;
          }

          ctx.globalAlpha = alpha;

          if (isHub) {
            const centralRadius = isExpandedHub ? 16 : 14;
            const outerRadius = (isExpandedHub ? 70 : 30) + Math.sqrt(node.count) * 8; 

            // Faint background fill (the very large faint circle)
            ctx.beginPath();
            ctx.arc(node.x, node.y, outerRadius, 0, Math.PI * 2);
            ctx.fillStyle = `${color}${isExpandedHub ? '06' : '04'}`; 
            ctx.fill();
            
            // Outer dashed circle
            if (isExpandedHub || isHov) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, outerRadius, 0, Math.PI * 2);
              ctx.strokeStyle = `${color}15`;
              ctx.setLineDash([4 / globalScale, 4 / globalScale]);
              ctx.lineWidth = 1 / globalScale;
              ctx.stroke();
              ctx.setLineDash([]); // reset
            }

            // Inner circle (count bubble)
            ctx.beginPath();
            ctx.arc(node.x, node.y, centralRadius, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? "#ffffff" : "#18181b"; 
            ctx.fill();
            ctx.strokeStyle = isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)";
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();

            // Count text
            const fontSize = isExpandedHub ? 12 : 11; 
            ctx.fillStyle = textColorPrimary;
            ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${node.count}`, node.x, node.y + 0.5);

            // Hub Label (above)
            if (globalScale > 0.4 || isExpandedHub) {
              ctx.fillStyle = textColorPrimary;
              ctx.font = `600 ${isExpandedHub ? 14 : Math.max(11, 12 / globalScale)}px "Plus Jakarta Sans", sans-serif`;
              ctx.fillText(
                node.label.charAt(0).toUpperCase() + node.label.slice(1),
                node.x,
                node.y - centralRadius - (isExpandedHub ? 24 : 12) / globalScale
              );
            }
          } else {
            // Claim dots
            const radius = isPartOfExpanded ? 3.5 : 2.5;

            // Fill
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Subtle Outline
            if (!isHov && !isSelected) {
              ctx.strokeStyle = isLight ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
              ctx.lineWidth = 1 / globalScale;
              ctx.stroke();
            }

            // Hover ring
            if (isSelected || isHov) {
              ctx.globalAlpha = 1;
              
              // Darken inner dot slightly on hover to match image
              ctx.fillStyle = isLight ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)";
              ctx.fill();

              ctx.beginPath();
              // Create a gap, then stroke
              ctx.arc(node.x, node.y, radius + 3.5/globalScale, 0, Math.PI * 2);
              ctx.strokeStyle = isLight ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.4)";
              ctx.lineWidth = 2 / globalScale;
              ctx.stroke();
            }
          }
          
          ctx.globalAlpha = 1; // reset for next node
        }}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.4}
        cooldownTicks={120}
      />

      {/* Segment Legend - Glassmorphism Pill */}
      <div
        style={{
          position: "absolute",
          bottom: selected ? 160 : 40,
          left: 32,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          maxWidth: 600,
          background: isLight ? "rgba(255, 255, 255, 0.85)" : "rgba(24, 24, 27, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"}`,
          padding: "12px 20px",
          borderRadius: 999,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08)",
          transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          zIndex: 10,
        }}
      >
        {segments.map((seg) => {
          const isFilterActive = segFilter === "all" || segFilter === seg;
          const isHighlightedByExpand = expandedHub ? expandedHub === `hub:${seg}` : true;
          const isDimmed = !isFilterActive || !isHighlightedByExpand;
          
          return (
            <button
              key={seg}
              onClick={() => setSegFilter(seg === segFilter ? "all" : seg)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 999,
                opacity: isDimmed ? 0.3 : 1,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { if (!isDimmed) e.currentTarget.style.background = isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: segColor(seg),
                  boxShadow: `0 0 8px ${segColor(seg)}80`
                }}
              />
              <span style={{ fontSize: 13, color: textColorPrimary, fontWeight: 500, textTransform: "capitalize" }}>
                {seg.replace(/_/g, " ")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected claim detail panel - Floating glass panel */}
      {selected && (
        <div
          className="fade-in"
          style={{
            position: "absolute",
            bottom: 32,
            left: 32,
            right: 32,
            background: isLight ? "rgba(255, 255, 255, 0.9)" : "rgba(18, 18, 20, 0.9)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 24,
            padding: "24px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            zIndex: 20,
            boxShadow: isLight ? "0 20px 40px rgba(0,0,0,0.06)" : "0 20px 40px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 4 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: `${segColor(selected.segment)}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `1px solid ${segColor(selected.segment)}30`,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: segColor(selected.segment),
                    boxShadow: `0 0 12px ${segColor(selected.segment)}80`
                  }}
                />
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: segColor(selected.segment), textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {selected.segment?.replace(/_/g, " ")}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: textColorPrimary,
                    background: isLight ? "#f1f5f9" : "#27272a",
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.02em"
                  }}
                >
                  {selected.tier?.replace(/_/g, "-")}
                </span>
              </div>
              
              <p style={{ fontFamily: "var(--font-display)", fontSize: 20, color: textColorPrimary, lineHeight: 1.4, margin: 0, fontWeight: 500 }}>
                {selected.fullText}
              </p>

              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                {selected.claim?.memory_class && (
                  <span style={{ fontSize: 12, padding: "4px 12px", background: "var(--input-bg)", color: textColorMuted, borderRadius: 8, border: "1px solid var(--border-color)", fontWeight: 500 }}>
                    Class: <span style={{color: textColorPrimary}}>{selected.claim.memory_class}</span>
                  </span>
                )}
                {selected.claim?.access_count !== undefined && (
                  <span style={{ fontSize: 12, padding: "4px 12px", background: "var(--input-bg)", color: textColorMuted, borderRadius: 8, border: "1px solid var(--border-color)", fontWeight: 500 }}>
                    Accessed: <span style={{color: textColorPrimary}}>{selected.claim.access_count}×</span>
                  </span>
                )}
                {selected.confidence !== undefined && (
                  <span style={{ fontSize: 12, padding: "4px 12px", background: "var(--input-bg)", color: textColorMuted, borderRadius: 8, border: "1px solid var(--border-color)", fontWeight: 500 }}>
                    Conf: <span style={{color: textColorPrimary}}>{Math.round(selected.confidence * 100)}%</span>
                  </span>
                )}
                {selected.claim?.user_confirmed && (
                  <span style={{ fontSize: 12, padding: "4px 12px", background: "var(--status-connected-bg)", color: "var(--status-connected-text)", borderRadius: 8, fontWeight: 600, border: "1px solid var(--status-connected-text)" }}>
                    ✓ Confirmed
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelected(null)}
              style={{
                background: "var(--button-bg)",
                border: "1px solid var(--border-color)",
                color: textColorPrimary,
                cursor: "pointer",
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--button-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "var(--button-bg)"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
