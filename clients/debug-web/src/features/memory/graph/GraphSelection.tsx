import { X } from "@agentic-browser/shared/icons";
import type { Claim } from "@agentic-browser/shared/api";
import { IconButton } from "@agentic-browser/shared/ui";
import { ClaimDetail } from "../ClaimDetail";
import { Dot } from "../Dot";
import { segmentColor, segmentLabel, tierLabel } from "../constants";

/** Card for the clicked memory, docked at the bottom of the graph. */
export function GraphSelection({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  return (
    <div className="graph-card ab-pop">
      <div className="graph-card__head">
        <span className="graph-card__tag">
          <Dot color={segmentColor(claim.segment)} /> {segmentLabel(claim.segment)}
        </span>
        <span className="graph-card__tag">{tierLabel(claim.tier)}</span>
        <IconButton label="Close" size="sm" onClick={onClose} className="graph-card__close">
          <X size={14} />
        </IconButton>
      </div>
      <p className="graph-card__text">{claim.claim_text}</p>
      <ClaimDetail claim={claim} />
    </div>
  );
}
