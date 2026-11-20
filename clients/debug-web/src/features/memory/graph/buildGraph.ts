import type { GraphClaim, GraphEntity, MemoryGraph } from "@agentic-browser/shared/api";

export type GraphNode = {
  id: string;
  kind: "entity" | "claim";
  label: string;
  /** Claims: memory segment. Entities: entity type. */
  group: string;
  size: number;
  faded?: boolean;
  entity?: GraphEntity;
  claim?: GraphClaim;
  x?: number;
  y?: number;
};

export type LinkKind = "subject" | "object" | "supersedes" | "contradicts";
export type GraphLink = { source: string | GraphNode; target: string | GraphNode; kind: LinkKind };

export type GraphFilter = { tier: string | null; segment: string | null };

/**
 * Entities are hubs; every claim hangs off the entity it is about (subject)
 * and points at the entity it mentions (object). SUPERSEDES and CONTRADICTS
 * relations connect claims. Entities with no visible claims are dropped.
 */
export function buildGraph(data: MemoryGraph, filter: GraphFilter) {
  const claims = data.claims.filter(
    (c) => (!filter.tier || c.tier === filter.tier) && (!filter.segment || c.segment === filter.segment),
  );
  const used = new Set<string>();
  for (const c of claims) {
    if (c.subject_id) used.add(c.subject_id);
    if (c.object_id) used.add(c.object_id);
  }
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  for (const e of data.entities) {
    if (!used.has(e.entity_id)) continue;
    nodes.push({ id: e.entity_id, kind: "entity", label: e.name, group: e.type, size: 7 + Math.min(Math.sqrt(e.claim_count) * 3.2, 16), entity: e });
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const c of claims) {
    nodes.push({ id: c.claim_id, kind: "claim", label: c.claim_text, group: c.segment, size: 3.4, faded: c.status !== "active", claim: c });
    if (c.subject_id && ids.has(c.subject_id)) links.push({ source: c.subject_id, target: c.claim_id, kind: "subject" });
    if (c.object_id && ids.has(c.object_id) && c.object_id !== c.subject_id) links.push({ source: c.claim_id, target: c.object_id, kind: "object" });
  }
  const claimIds = new Set(claims.map((c) => c.claim_id));
  for (const r of data.relations) {
    if (!claimIds.has(r.from) || !claimIds.has(r.to)) continue;
    const kind = r.type.toUpperCase() === "CONTRADICTS" ? "contradicts" : r.type.toUpperCase() === "SUPERSEDES" ? "supersedes" : null;
    if (kind) links.push({ source: r.from, target: r.to, kind });
  }
  return { nodes, links };
}

export const nodeId = (end: string | GraphNode) => (typeof end === "string" ? end : end.id);

/** Lower-case text a search box can match against. */
export const nodeText = (n: GraphNode) =>
  (n.kind === "entity" ? `${n.label} ${(n.entity?.aliases ?? []).join(" ")} ${n.entity?.description ?? ""}` : n.label).toLowerCase();
