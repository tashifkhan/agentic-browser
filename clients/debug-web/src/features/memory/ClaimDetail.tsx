import { Check } from "@agentic-browser/shared/icons";
import { fullTime, timeAgo } from "@agentic-browser/shared/format";
import type { Claim } from "@agentic-browser/shared/api";

/** Facts about one claim, shown under a list row and in the graph panel. */
export function ClaimDetail({ claim }: { claim: Claim }) {
  const items: [string, React.ReactNode][] = [
    ["Class", claim.memory_class],
    ["Confidence", `${Math.round(claim.confidence * 100)}%`],
    ["Trust", `${Math.round(claim.trust_score * 100)}%`],
    ["Recalled", `${claim.access_count} times`],
    ["Added", <span title={fullTime(claim.created_at)}>{timeAgo(claim.created_at)}</span>],
    ["Status", claim.status],
  ];
  return (
    <dl className="claim-detail">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {claim.user_confirmed && (
        <div>
          <dt>You</dt>
          <dd className="claim-detail__ok">
            <Check size={12} /> confirmed
          </dd>
        </div>
      )}
    </dl>
  );
}
