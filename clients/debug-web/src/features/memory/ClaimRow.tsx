import { useState } from "react";
import { ChevronDown } from "@agentic-browser/shared/icons";
import { timeAgo } from "@agentic-browser/shared/format";
import type { Claim } from "@agentic-browser/shared/api";
import { ClaimActions } from "./ClaimActions";
import { ClaimDetail } from "./ClaimDetail";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { Dot } from "./Dot";
import { segmentColor, segmentLabel, tierColor, tierLabel } from "./constants";

export function ClaimRow({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`claim${open ? " is-open" : ""}`}>
      <button type="button" className="claim__main mem-grid" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="claim__text">{claim.claim_text}</span>
        <span className="claim__tag">
          <Dot color={tierColor(claim.tier)} /> {tierLabel(claim.tier)}
        </span>
        <span className="claim__tag claim__seg">
          <Dot color={segmentColor(claim.segment)} /> {segmentLabel(claim.segment)}
        </span>
        <ConfidenceMeter value={claim.confidence} />
        <span className="claim__date">{timeAgo(claim.created_at)}</span>
        <ChevronDown size={14} className="claim__chev" />
      </button>
      {open && (
        <div className="claim__more ab-fade">
          <ClaimDetail claim={claim} />
          <ClaimActions claimId={claim.claim_id} confirmed={claim.user_confirmed} />
        </div>
      )}
    </div>
  );
}
