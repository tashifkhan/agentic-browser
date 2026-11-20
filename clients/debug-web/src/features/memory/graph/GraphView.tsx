import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useMemoryGraph } from "@agentic-browser/shared/query";
import { QueryView, StateView } from "@agentic-browser/shared/ui";
import { Brain } from "@agentic-browser/shared/icons";
import { buildGraph, nodeId, nodeText, type GraphLink, type GraphNode } from "./buildGraph";
import { GraphControls } from "./GraphControls";
import { GraphLegend } from "./GraphLegend";
import { GraphSelection } from "./GraphSelection";
import { linkColor, paintNode } from "./paint";
import { usePalette } from "./usePalette";
import { useSize } from "./useSize";

/** The memory knowledge graph: entities as hubs, claims around them, history edges between claims. */
export default function GraphView({ tier, search }: { tier: string | null; search: string }) {
  const [history, setHistory] = useState(false);
  const query = useMemoryGraph(history);
  return (
    <QueryView query={query} skeleton={<StateView kind="loading" title="Loading graph" style={{ height: "100%" }} />}>
      {(data) =>
        data.claims.length ? (
          <Canvas data={data} tier={tier} search={search} history={history} onHistory={setHistory} />
        ) : (
          <StateView icon={<Brain size={18} />} title="No memories to draw" style={{ height: "100%" }} />
        )
      }
    </QueryView>
  );
}

function Canvas({
  data, tier, search, history, onHistory,
}: {
  data: NonNullable<ReturnType<typeof useMemoryGraph>["data"]>;
  tier: string | null;
  search: string;
  history: boolean;
  onHistory: (v: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const size = useSize(box);
  const palette = usePalette();
  const [segment, setSegment] = useState<string | null>(null);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const graph = useMemo(() => buildGraph(data, { tier, segment }), [data, tier, segment]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of graph.links) {
      const a = nodeId(l.source);
      const b = nodeId(l.target);
      (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b);
      (m.get(b) ?? m.set(b, new Set()).get(b)!).add(a);
    }
    return m;
  }, [graph]);

  const segments = useMemo(() => [...new Set(data.claims.map((c) => c.segment))].sort(), [data]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const focus = hovered ?? selected;
  const focusSet = focus ? new Set([focus.id, ...(neighbours.get(focus.id) ?? [])]) : null;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? new Set(graph.nodes.filter((n) => nodeText(n).includes(q)).map((n) => n.id)) : null;
  }, [graph, search]);

  const fit = useCallback(() => fg.current?.zoomToFit(600, 70), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "f") fit();
      if (e.key === "Escape") {
        setSelectedId(null);
        setSegment(null);
        fit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fit]);

  useEffect(() => {
    // Entities push each other apart; claims stay close to their entity.
    fg.current?.d3Force("charge")?.strength((n: GraphNode) => (n.kind === "entity" ? -140 - n.size * 6 : -18)).distanceMax(260);
    fg.current?.d3Force("link")
      ?.distance((l: GraphLink) => (l.kind === "supersedes" || l.kind === "contradicts" ? 16 : l.kind === "object" ? 70 : 30 + (typeof l.source === "object" ? l.source.size : 0)))
      .strength((l: GraphLink) => (l.kind === "object" ? 0.18 : l.kind === "subject" ? 0.8 : 0.5));
    fg.current?.d3ReheatSimulation?.();
  }, [graph]);

  const emphasis = (l: GraphLink) => {
    if (!focusSet && !matches) return "normal" as const;
    const a = nodeId(l.source);
    const b = nodeId(l.target);
    if (focus && (a === focus.id || b === focus.id)) return "strong" as const;
    if (matches && (matches.has(a) || matches.has(b))) return "normal" as const;
    return "dim" as const;
  };

  const entityCount = graph.nodes.filter((n) => n.kind === "entity").length;
  const claimCount = graph.nodes.length - entityCount;
  const historyCount = data.relations.filter((r) => r.type.toUpperCase() === "SUPERSEDES").length;

  return (
    <div ref={box} className="graph">
      <div className="graph-title">
        <strong>{entityCount}</strong> entities · <strong>{claimCount}</strong> memories
        {matches && <span className="graph-title__sub">{matches.size} match "{search}"</span>}
      </div>
      <GraphControls
        history={history}
        historyCount={historyCount}
        onHistory={onHistory}
        onFit={fit}
        onZoom={(f) => fg.current?.zoom(fg.current.zoom() * f, 250)}
      />
      <ForceGraph2D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={graph}
        backgroundColor="rgba(0,0,0,0)"
        nodeLabel={() => ""}
        nodeVal={(n: GraphNode) => n.size}
        nodeRelSize={1}
        linkColor={(l: GraphLink) => linkColor(l, palette, emphasis(l))}
        linkWidth={(l: GraphLink) => (emphasis(l) === "strong" ? 1.6 : l.kind === "supersedes" || l.kind === "contradicts" ? 1.4 : 0.8)}
        linkLineDash={(l: GraphLink) => (l.kind === "object" ? [2, 3] : l.kind === "contradicts" ? [4, 3] : null)}
        linkDirectionalArrowLength={(l: GraphLink) => (l.kind === "supersedes" || l.kind === "object" ? 3.5 : 0)}
        linkDirectionalArrowRelPos={0.9}
        onNodeHover={(n: GraphNode | null) => {
          setHovered(n);
          if (box.current) box.current.style.cursor = n ? "pointer" : "";
        }}
        onNodeClick={(n: GraphNode) => {
          setSelectedId(n.id);
          fg.current?.centerAt(n.x, n.y, 500);
        }}
        onBackgroundClick={() => setSelectedId(null)}
        onEngineStop={() => !selectedId && fit()}
        nodeCanvasObject={(n: GraphNode, ctx: CanvasRenderingContext2D, scale: number) =>
          paintNode(n, ctx, scale, palette, {
            hovered: hovered?.id === n.id,
            selected: selectedId === n.id,
            match: !!matches?.has(n.id),
            neighbour: !!focusSet?.has(n.id) && focus?.kind === "entity" && (neighbours.get(focus.id)?.size ?? 0) <= 8,
            dim: matches ? !matches.has(n.id) && !(focusSet?.has(n.id)) : !!focusSet && !focusSet.has(n.id),
          })
        }
        nodePointerAreaPaint={(n: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, n.kind === "entity" ? n.size + 2 : n.size + 3, 0, Math.PI * 2);
          ctx.fill();
        }}
        cooldownTicks={160}
        d3VelocityDecay={0.35}
      />
      {hovered?.kind === "claim" && hovered.id !== selectedId && <div className="graph-tip">{hovered.label}</div>}
      <GraphLegend segments={segments} only={segment} onPick={setSegment} />
      {selected && (
        <GraphSelection
          node={selected}
          history={graph.links
            .filter((l) => (l.kind === "supersedes" || l.kind === "contradicts") && [nodeId(l.source), nodeId(l.target)].includes(selected.id))
            .map((l) => {
              const outgoing = nodeId(l.source) === selected.id;
              const other = byId.get(outgoing ? nodeId(l.target) : nodeId(l.source))!;
              const label = l.kind === "contradicts" ? "Conflicts with" : outgoing ? "Replaced" : "Replaced by";
              return { label, node: other };
            })
            .filter((h) => h.node)}
          related={[...(neighbours.get(selected.id) ?? [])].map((id) => byId.get(id)!).filter(Boolean)}
          onPick={(n) => {
            setSelectedId(n.id);
            fg.current?.centerAt(n.x, n.y, 500);
          }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
