import type { UseQueryResult } from "@tanstack/react-query";
import { Brain, Plus, SearchX } from "@agentic-browser/shared/icons";
import type { Claim } from "@agentic-browser/shared/api";
import { Button, QueryView, Skeleton, StateView } from "@agentic-browser/shared/ui";
import { ClaimRow } from "./ClaimRow";

const skeleton = Array.from({ length: 8 }).map((_, i) => (
  <div key={i} className="mem-grid claim-skel">
    <Skeleton width={`${50 + ((i * 17) % 40)}%`} height={11} />
    <Skeleton width={64} height={11} />
    <Skeleton width={80} height={11} />
    <Skeleton width={84} height={11} />
  </div>
));

/** Table of claims with column headers, empty states and load-more. */
export function ClaimList({
  query,
  rows,
  onAdd,
  onClear,
  onMore,
}: {
  query: UseQueryResult<Claim[]>;
  rows: Claim[];
  onAdd: () => void;
  onClear: () => void;
  onMore?: () => void;
}) {
  return (
    <div className="ab-card mem-body">
      <div className="mem-grid mem-head" aria-hidden="true">
        <span>Memory</span>
        <span>Tier</span>
        <span>Segment</span>
        <span>Confidence</span>
        <span>Added</span>
        <span />
      </div>
      <div className="mem-list">
        <QueryView
          query={query}
          skeleton={skeleton}
          errorHint="Memories live in Postgres and Neo4j."
          empty={
            <StateView
              icon={<Brain size={18} />}
              title="No memories yet"
              body="The agent learns from conversations. You can also add your profile, notes or documents."
              action={<Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={onAdd}>Add a memory</Button>}
              style={{ minHeight: 320 }}
            />
          }
        >
          {() =>
            rows.length ? (
              rows.map((c) => <ClaimRow key={c.claim_id} claim={c} />)
            ) : (
              <StateView
                icon={<SearchX size={18} />}
                title="Nothing matches"
                body="Try another word or tier."
                action={<Button size="sm" onClick={onClear}>Clear filters</Button>}
                style={{ minHeight: 260 }}
              />
            )
          }
        </QueryView>
      </div>
      {onMore && (
        <div className="mem-foot">
          <Button size="sm" onClick={onMore} loading={query.isFetching}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
