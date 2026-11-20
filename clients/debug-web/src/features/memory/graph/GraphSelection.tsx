import { X } from "@agentic-browser/shared/icons";
import { IconButton } from "@agentic-browser/shared/ui";
import { Dot } from "../Dot";
import { segmentColor, segmentLabel, tierLabel } from "../constants";
import { ClaimActions } from "../ClaimActions";
import type { GraphNode } from "./buildGraph";

const humanize = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Card for the clicked node. An entity lists what memory knows about it; a claim shows its facts. */
export function GraphSelection({
  node, related, history = [], onPick, onClose,
}: {
  node: GraphNode;
  related: GraphNode[];
  /** Supersede/contradiction links to other claims, already labelled. */
  history?: { label: string; node: GraphNode }[];
  onPick: (n: GraphNode) => void;
  onClose: () => void;
}) {
  const claims = related.filter((n) => n.kind === "claim");
  const entities = related.filter((n) => n.kind === "entity");
  const aliases = (node.entity?.aliases ?? []).filter((a) => a.toLowerCase() !== node.label.toLowerCase());
  return (
    <div className="graph-card ab-pop">
      <div className="graph-card__head">
        {node.kind === "entity" ? (
          <span className="graph-card__tag">{humanize(node.group)}</span>
        ) : (
          <>
            <span className="graph-card__tag">
              <Dot color={segmentColor(node.group)} /> {segmentLabel(node.group)}
            </span>
            {node.claim && <span className="graph-card__tag">{tierLabel(node.claim.tier)}</span>}
            {node.claim?.status === "superseded" && <span className="graph-card__tag is-warn">Replaced</span>}
          </>
        )}
        <IconButton label="Close" size="sm" onClick={onClose} className="graph-card__close">
          <X size={14} />
        </IconButton>
      </div>
      <p className="graph-card__text">{node.label}</p>
      {node.kind === "entity" && node.entity && (
        <>
          {(aliases.length > 0 || node.entity.description) && (
            <p className="graph-card__sub">
              {node.entity.description}
              {aliases.length > 0 && <> {node.entity.description ? "· " : ""}also {aliases.join(", ")}</>}
            </p>
          )}
          <ul className="graph-card__list">
            {claims.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c)} className={c.faded ? "is-faded" : undefined}>
                  <Dot color={segmentColor(c.group)} /> {c.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {node.kind === "claim" && node.claim && (
        <>
          {entities.length > 0 && (
            <div className="graph-card__chips">
              {entities.map((e) => (
                <button key={e.id} type="button" className="graph-card__chip" onClick={() => onPick(e)}>
                  {e.label}
                </button>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <ul className="graph-card__history">
              {history.map((h) => (
                <li key={`${h.label}-${h.node.id}`}>
                  <span>{h.label}</span>
                  <button type="button" onClick={() => onPick(h.node)}>{h.node.label}</button>
                </li>
              ))}
            </ul>
          )}
          <ClaimActions claimId={node.claim.claim_id} confirmed={node.claim.status === "superseded"} compact />
        </>
      )}
    </div>
  );
}
