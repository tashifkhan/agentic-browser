import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Claim } from "@agentic-browser/shared/api";
import { StateView } from "@agentic-browser/shared/ui";
import { Brain } from "@agentic-browser/shared/icons";
import { buildGraph, nodeId, type GraphLink, type GraphNode } from "./buildGraph";
import { GraphControls } from "./GraphControls";
import { GraphLegend } from "./GraphLegend";
import { GraphSelection } from "./GraphSelection";
import { paintNode, withAlpha } from "./paint";
import { usePalette } from "./usePalette";
import { useSize } from "./useSize";

export default function GraphView({ claims }: { claims: Claim[] }) {
  const box = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const size = useSize(box);
  const palette = usePalette();
  const [only, setOnly] = useState<string | null>(null);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [search, setSearch] = useState("");

  const graph = useMemo(() => buildGraph(claims, only), [claims, only]);
  const segments = useMemo(() => [...new Set(claims.map((c) => c.segment))].sort(), [claims]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? new Set(claims.filter((c) => c.claim_text.toLowerCase().includes(q)).map((c) => c.claim_id)) : null;
  }, [claims, search]);

  const fit = useCallback(() => fg.current?.zoomToFit(600, 48), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "f") fit();
      if (e.key === "Escape") {
        setSelected(null);
        setOnly(null);
        setSearch("");
        fit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fit]);

  useEffect(() => {
    fg.current?.d3Force("charge")?.strength((n: GraphNode) => (n.kind === "hub" ? -900 : -30));
    fg.current?.d3Force("link")?.distance((l: GraphLink) => (l.hub ? 260 : 46)).strength((l: GraphLink) => (l.hub ? 0.04 : 0.8));
  }, [graph]);

  if (!claims.length) return <StateView icon={<Brain size={18} />} title="No memories to draw" style={{ height: "100%" }} />;

  return (
    <div ref={box} className="graph">
      <div className="graph-title">
        <strong>{claims.length}</strong> memories in <strong>{segments.length}</strong> segments
        {matches && <span className="graph-title__sub">{matches.size} match "{search}"</span>}
      </div>
      <GraphControls search={search} onSearch={setSearch} onFit={fit} onZoom={(f) => fg.current?.zoom(fg.current.zoom() * f, 250)} />
      <ForceGraph2D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={graph}
        backgroundColor="rgba(0,0,0,0)"
        nodeLabel={() => ""}
        nodeRelSize={5}
        linkColor={(l: GraphLink) => (l.hub ? withAlpha(palette.line, 0.08) : hovered && [nodeId(l.source), nodeId(l.target)].includes(hovered.id) ? palette.muted : palette.line)}
        linkLineDash={(l: GraphLink) => (l.hub ? [3, 6] : null)}
        onNodeHover={(n: GraphNode | null) => setHovered(n)}
        onNodeClick={(n: GraphNode) => {
          if (n.kind === "claim") setSelected(n.claim ?? null);
          else setOnly((o) => (o === n.segment ? null : n.segment));
          fg.current?.centerAt(n.x, n.y, 500);
        }}
        onBackgroundClick={() => setSelected(null)}
        onEngineStop={() => !selected && fit()}
        nodeCanvasObject={(n: GraphNode, ctx: CanvasRenderingContext2D, scale: number) =>
          paintNode(n, ctx, scale, palette, {
            hovered: hovered?.id === n.id,
            selected: selected?.claim_id === n.id,
            match: !!matches?.has(n.id),
            dim: !!matches && (n.kind === "hub" ? ![...matches].some((id) => graph.nodes.find((g) => g.id === id)?.segment === n.segment) : !matches.has(n.id)),
          })
        }
        cooldownTicks={140}
        d3VelocityDecay={0.4}
      />
      {hovered?.kind === "claim" && hovered.id !== selected?.claim_id && <div className="graph-tip">{hovered.label}</div>}
      <GraphLegend segments={segments} only={only} onPick={setOnly} />
      {selected && <GraphSelection claim={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
