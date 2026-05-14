import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Claim } from "../lib/api";

const SEGMENT_COLORS: Record<string, string> = {
  core_identity: "#f43f5e",
  preference:    "#2dd4bf",
  relationship:  "#3b82f6",
  project:       "#fb923c",
  knowledge:     "#0ea5e9",
  context:       "#71717a",
  professional:  "#a78bfa",
  skill:         "#34d399",
  behavioral:    "#6366f1",
  correction:    "#fbbf24",
  identity:      "#f43f5e",
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

  for (let i = 0; i < segmentNodes.length; i++) {
    for (let j = i + 1; j < segmentNodes.length; j++) {
      links.push({
        source: `hub:${segmentNodes[i]}`,
        target: `hub:${segmentNodes[j]}`,
        isHubLink: true,
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
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [currentZoom, setCurrentZoom] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect;
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

  // IDs of claim nodes that match the search query
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (node.kind === "claim" && (node.fullText?.toLowerCase().includes(q) || node.label?.toLowerCase().includes(q))) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [searchQuery, graph.nodes]);

  const handleNodeClick = useCallback((node: any) => {
    if (node.kind === "claim") {
      setSelected(node);
      if (fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 800);
        fgRef.current.zoom(2.5, 800);
      }
    } else if (node.kind === "hub") {
      if (expandedHub === node.id) {
        setExpandedHub(null);
        if (fgRef.current) fgRef.current.zoomToFit(800, 40);
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
    setHoveredNode(node ?? null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        setSelected(null);
        setExpandedHub(null);
        setSearchQuery("");
        fgRef.current?.zoomToFit(800, 40);
      }
      if (e.key === "f" || e.key === "F") {
        fgRef.current?.zoomToFit(600, 40);
      }
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force("charge").strength((node: any) => {
        if (node.kind === "hub") return expandedHub === node.id ? -100 : -1000;
        const isPartOfExpanded = expandedHub === `hub:${node.segment}`;
        return isPartOfExpanded ? 0 : -25;
      });
      fgRef.current.d3Force("link")
        .distance((link: any) => link.isHubLink ? 400 : 45)
        .strength((link: any) => link.isHubLink ? 0.05 : 0.8);
      fgRef.current.d3Force("radialCircle", (alpha: number) => {
        if (!expandedHub) return;
        const nodes = graph.nodes;
        const hub = nodes.find((n: any) => n.id === expandedHub);
        if (!hub) return;
        const children = nodes.filter((n: any) => n.kind === "claim" && `hub:${n.segment}` === expandedHub);
        const radius = Math.max(140, children.length * 8);
        children.forEach((child: any, i: number) => {
          const targetAngle = (i / children.length) * 2 * Math.PI - Math.PI / 2;
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
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "var(--bg-color)" }}>
        <div style={{ fontSize: 32, opacity: 0.15 }}>◎</div>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No memory claims yet.</span>
      </div>
    );
  }

  const isLight = theme === "light";
  const bgColor = isLight ? "#fafafa" : "#09090b";
  const lineColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
  const hubLineColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const textColorPrimary = isLight ? "#09090b" : "#ffffff";
  const textColorMuted = isLight ? "#71717a" : "#a1a1aa";
  const glassBg = isLight ? "rgba(255,255,255,0.85)" : "rgba(24,24,27,0.85)";
  const glassBorder = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
  const numClusters = segments.length;

  const searchMatchCount = searchMatchIds ? searchMatchIds.size : 0;

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative", background: bgColor, fontFamily: "var(--font-main)" }}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      {/* Top Left: stats */}
      <div style={{ position: "absolute", top: 32, left: 32, zIndex: 10, pointerEvents: "none" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: textColorPrimary, margin: 0, letterSpacing: "-0.02em" }}>
          {claims.length} memories <span style={{ color: textColorMuted, fontWeight: 400 }}>/ {numClusters} clusters</span>
        </h2>
        {expandedHub && (
          <p className="fade-in" style={{ margin: "4px 0 0", color: "var(--accent-color)", fontSize: 13, fontWeight: 500, letterSpacing: "0.02em" }}>
            Viewing: {expandedHub.replace("hub:", "").replace(/_/g, " ")}
          </p>
        )}
        {searchMatchIds && (
          <p className="fade-in" style={{ margin: "4px 0 0", color: textColorMuted, fontSize: 12 }}>
            {searchMatchCount} match{searchMatchCount !== 1 ? "es" : ""} for &ldquo;{searchQuery}&rdquo;
          </p>
        )}
      </div>

      {/* Top Right: search + keyboard hint — offset below the Table/Graph toggle in MemoryPanel */}
      <div style={{ position: "absolute", top: 80, right: 32, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: glassBg, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${glassBorder}`, borderRadius: 12, padding: "8px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textColorMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); e.currentTarget.blur(); } }}
            placeholder="Search claims…"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: textColorPrimary,
              width: 160,
              fontFamily: "var(--font-main)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: textColorMuted, display: "flex", alignItems: "center" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
        <span style={{ fontSize: 11, color: textColorMuted, opacity: 0.6 }}>
          / to search · f to fit · esc to reset
        </span>
      </div>

      {/* Zoom controls — bottom right */}
      <div style={{ position: "absolute", bottom: selected ? 180 : 40, right: 32, zIndex: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { label: "+", title: "Zoom in", onClick: () => fgRef.current?.zoom(currentZoom * 1.5, 300) },
          { label: "−", title: "Zoom out", onClick: () => fgRef.current?.zoom(currentZoom * 0.67, 300) },
          { label: "⊡", title: "Fit view (f)", onClick: () => fgRef.current?.zoomToFit(600, 40) },
        ].map(({ label, title, onClick }) => (
          <button
            key={label}
            title={title}
            onClick={onClick}
            style={{
              width: 32, height: 32,
              background: glassBg,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: `1px solid ${glassBorder}`,
              borderRadius: 8,
              color: textColorPrimary,
              fontSize: label === "⊡" ? 14 : 18,
              lineHeight: 1,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            {label}
          </button>
        ))}
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
          if (expandedHub) {
            const isRelated =
              link.source?.id === expandedHub ||
              link.target?.id === expandedHub ||
              link.source?.segment === expandedHub.replace("hub:", "") ||
              link.target?.segment === expandedHub.replace("hub:", "");
            if (!isRelated || link.isHubLink) {
              color = isLight ? "rgba(0,0,0,0.01)" : "rgba(255,255,255,0.01)";
            } else {
              color = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";
            }
          }
          if (isHov) color = isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.3)";
          return color;
        }}
        nodeLabel={() => ""}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBgClick}
        onZoom={(t: { k: number }) => setCurrentZoom(t.k)}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const isHub = node.kind === "hub";
          const isSelected = selected?.id === node.id;
          const isHov = hovered === node.id;
          const isExpandedHub = expandedHub === node.id;
          const isPartOfExpanded = expandedHub === `hub:${node.segment}`;
          const color = node.color ?? "#71717a";

          // Search dimming: dim nodes that don't match
          const isSearchActive = searchMatchIds !== null;
          const matchesSearch = isSearchActive ? (isHub ? false : searchMatchIds!.has(node.id)) : true;
          const hubHasMatch = isSearchActive && isHub
            ? graph.nodes.some((n: any) => n.kind === "claim" && n.segment === node.segment && searchMatchIds!.has(n.id))
            : true;

          let alpha = 1;
          if (expandedHub && !isExpandedHub && !isPartOfExpanded) {
            alpha = 0.1;
          } else if (isSearchActive) {
            if (isHub) alpha = hubHasMatch ? 1 : 0.08;
            else alpha = matchesSearch ? 1 : 0.06;
          }

          ctx.globalAlpha = alpha;

          if (isHub) {
            const centralRadius = isExpandedHub ? 16 : 14;
            const outerRadius = (isExpandedHub ? 70 : 30) + Math.sqrt(node.count) * 8;

            ctx.beginPath();
            ctx.arc(node.x, node.y, outerRadius, 0, Math.PI * 2);
            ctx.fillStyle = `${color}${isExpandedHub ? "06" : "04"}`;
            ctx.fill();

            if (isExpandedHub || isHov) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, outerRadius, 0, Math.PI * 2);
              ctx.strokeStyle = `${color}15`;
              ctx.setLineDash([4 / globalScale, 4 / globalScale]);
              ctx.lineWidth = 1 / globalScale;
              ctx.stroke();
              ctx.setLineDash([]);
            }

            ctx.beginPath();
            ctx.arc(node.x, node.y, centralRadius, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? "#ffffff" : "#18181b";
            ctx.fill();
            ctx.strokeStyle = isHov
              ? color
              : isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)";
            ctx.lineWidth = isHov ? 2.5 / globalScale : 2 / globalScale;
            ctx.stroke();

            const fontSize = isExpandedHub ? 12 : 11;
            ctx.fillStyle = textColorPrimary;
            ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${node.count}`, node.x, node.y + 0.5);

            if (globalScale > 0.4 || isExpandedHub) {
              ctx.fillStyle = isHov ? color : textColorPrimary;
              ctx.font = `600 ${isExpandedHub ? 14 : Math.max(11, 12 / globalScale)}px "Plus Jakarta Sans", sans-serif`;
              ctx.fillText(
                node.label.charAt(0).toUpperCase() + node.label.slice(1),
                node.x,
                node.y - centralRadius - (isExpandedHub ? 24 : 12) / globalScale
              );
            }
          } else {
            const radius = isPartOfExpanded ? 3.5 : matchesSearch ? 3.5 : 2.5;

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();

            if (!isHov && !isSelected) {
              ctx.strokeStyle = isLight ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
              ctx.lineWidth = 1 / globalScale;
              ctx.stroke();
            }

            if (isSelected || isHov) {
              ctx.globalAlpha = alpha;
              ctx.fillStyle = isLight ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)";
              ctx.fill();
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius + 3.5 / globalScale, 0, Math.PI * 2);
              ctx.strokeStyle = isLight ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.4)";
              ctx.lineWidth = 2 / globalScale;
              ctx.stroke();
            }

            // Highlight ring for search matches
            if (matchesSearch && isSearchActive && !isHov && !isSelected) {
              ctx.globalAlpha = 1;
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius + 2 / globalScale, 0, Math.PI * 2);
              ctx.strokeStyle = color;
              ctx.lineWidth = 1.5 / globalScale;
              ctx.stroke();
            }
          }

          ctx.globalAlpha = 1;
        }}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.4}
        cooldownTicks={120}
      />

      {/* Hover tooltip — only for non-selected nodes */}
      {hoveredNode && hoveredNode.id !== selected?.id && (
        <div
          className="fade-in"
          style={{
            position: "fixed",
            left: mousePos.x + 14,
            top: mousePos.y + 14,
            zIndex: 50,
            pointerEvents: "none",
            background: glassBg,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${glassBorder}`,
            borderRadius: 14,
            padding: "12px 16px",
            maxWidth: 260,
            boxShadow: isLight ? "0 8px 24px rgba(0,0,0,0.1)" : "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {hoveredNode.kind === "hub" ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: segColor(hoveredNode.segment), boxShadow: `0 0 8px ${segColor(hoveredNode.segment)}80`, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: textColorPrimary, textTransform: "capitalize" }}>
                  {hoveredNode.label}
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: textColorMuted }}>
                <span>{hoveredNode.count} claim{hoveredNode.count !== 1 ? "s" : ""}</span>
                <span style={{ color: "var(--accent-color)", opacity: 0.7 }}>click to expand</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: segColor(hoveredNode.segment), flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: segColor(hoveredNode.segment), textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {hoveredNode.segment?.replace(/_/g, " ")}
                </span>
                {hoveredNode.tier && (
                  <span style={{ fontSize: 10, color: textColorMuted, background: isLight ? "#f1f5f9" : "#27272a", padding: "2px 7px", borderRadius: 999, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em", marginLeft: "auto" }}>
                    {hoveredNode.tier.replace(/_/g, "-")}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: textColorPrimary, lineHeight: 1.5, fontFamily: "var(--font-display)" }}>
                {hoveredNode.fullText?.slice(0, 120)}{(hoveredNode.fullText?.length ?? 0) > 120 ? "…" : ""}
              </p>
              {hoveredNode.confidence !== undefined && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 3, borderRadius: 999, background: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.round(hoveredNode.confidence * 100)}%`, height: "100%", borderRadius: 999, background: hoveredNode.confidence >= 0.8 ? "#34d399" : hoveredNode.confidence >= 0.5 ? "#fbbf24" : "#f87171" }} />
                  </div>
                  <span style={{ fontSize: 11, color: textColorMuted, flexShrink: 0 }}>{Math.round(hoveredNode.confidence * 100)}% conf.</span>
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 11, color: textColorMuted, opacity: 0.6 }}>click for details</div>
            </>
          )}
        </div>
      )}

      {/* Segment Legend */}
      <div
        style={{
          position: "absolute",
          bottom: selected ? 160 : 40,
          left: 32,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          maxWidth: 600,
          background: glassBg,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${glassBorder}`,
          padding: "12px 20px",
          borderRadius: 999,
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
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
                display: "flex", alignItems: "center", gap: 8,
                background: "transparent", border: "none", cursor: "pointer",
                padding: "4px 8px", borderRadius: 999,
                opacity: isDimmed ? 0.3 : 1,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { if (!isDimmed) e.currentTarget.style.background = isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: segColor(seg), boxShadow: `0 0 8px ${segColor(seg)}80` }} />
              <span style={{ fontSize: 13, color: textColorPrimary, fontWeight: 500, textTransform: "capitalize" }}>
                {seg.replace(/_/g, " ")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected claim detail panel */}
      {selected && (
        <div
          className="fade-in"
          style={{
            position: "absolute", bottom: 32, left: 32, right: 32,
            background: isLight ? "rgba(255,255,255,0.9)" : "rgba(18,18,20,0.9)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 24, padding: "24px 32px",
            display: "flex", flexDirection: "column", gap: 12,
            zIndex: 20,
            boxShadow: isLight ? "0 20px 40px rgba(0,0,0,0.06)" : "0 20px 40px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 4 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: `${segColor(selected.segment)}15`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${segColor(selected.segment)}30` }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: segColor(selected.segment), boxShadow: `0 0 12px ${segColor(selected.segment)}80` }} />
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: segColor(selected.segment), textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {selected.segment?.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 11, color: textColorPrimary, background: isLight ? "#f1f5f9" : "#27272a", padding: "4px 10px", borderRadius: 999, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                  {selected.tier?.replace(/_/g, "-")}
                </span>
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 20, color: textColorPrimary, lineHeight: 1.4, margin: 0, fontWeight: 500 }}>
                {selected.fullText}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                {selected.claim?.memory_class && (
                  <span style={{ fontSize: 12, padding: "4px 12px", background: "var(--input-bg)", color: textColorMuted, borderRadius: 8, border: "1px solid var(--border-color)", fontWeight: 500 }}>
                    Class: <span style={{ color: textColorPrimary }}>{selected.claim.memory_class}</span>
                  </span>
                )}
                {selected.claim?.access_count !== undefined && (
                  <span style={{ fontSize: 12, padding: "4px 12px", background: "var(--input-bg)", color: textColorMuted, borderRadius: 8, border: "1px solid var(--border-color)", fontWeight: 500 }}>
                    Accessed: <span style={{ color: textColorPrimary }}>{selected.claim.access_count}×</span>
                  </span>
                )}
                {selected.confidence !== undefined && (
                  <span style={{ fontSize: 12, padding: "4px 12px", background: "var(--input-bg)", color: textColorMuted, borderRadius: 8, border: "1px solid var(--border-color)", fontWeight: 500 }}>
                    Conf: <span style={{ color: textColorPrimary }}>{Math.round(selected.confidence * 100)}%</span>
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
              style={{ background: "var(--button-bg)", border: "1px solid var(--border-color)", color: textColorPrimary, cursor: "pointer", width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--button-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "var(--button-bg)"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
