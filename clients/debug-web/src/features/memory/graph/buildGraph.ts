import type { Claim } from "@agentic-browser/shared/api";
import { segmentLabel } from "../constants";

export type GraphNode = {
  id: string;
  kind: "hub" | "claim";
  segment: string;
  label: string;
  count?: number;
  claim?: Claim;
  x?: number;
  y?: number;
};
export type GraphLink = { source: string | GraphNode; target: string | GraphNode; hub?: boolean };

/** One hub per segment, each claim linked to its hub, hubs loosely linked to each other. */
export function buildGraph(claims: Claim[], only: string | null) {
  const visible = only ? claims.filter((c) => c.segment === only) : claims;
  const bySegment = new Map<string, Claim[]>();
  for (const c of visible) {
    const seg = c.segment || "other";
    bySegment.set(seg, [...(bySegment.get(seg) ?? []), c]);
  }
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const hubs = [...bySegment.keys()];
  for (const [segment, members] of bySegment) {
    nodes.push({ id: `hub:${segment}`, kind: "hub", segment, label: segmentLabel(segment), count: members.length });
    for (const c of members) {
      nodes.push({ id: c.claim_id, kind: "claim", segment, label: c.claim_text, claim: c });
      links.push({ source: `hub:${segment}`, target: c.claim_id });
    }
  }
  for (let i = 0; i < hubs.length; i++)
    for (let j = i + 1; j < hubs.length; j++) links.push({ source: `hub:${hubs[i]}`, target: `hub:${hubs[j]}`, hub: true });
  return { nodes, links };
}

export const nodeId = (end: string | GraphNode) => (typeof end === "string" ? end : end.id);
