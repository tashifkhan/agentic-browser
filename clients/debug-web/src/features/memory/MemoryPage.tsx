import { lazy, Suspense, useMemo, useState } from "react";
import { useClaims } from "@agentic-browser/shared/query";
import { StateView } from "@agentic-browser/shared/ui";
import { AddMemoryDialog } from "./add/AddMemoryDialog";
import { ClaimList } from "./ClaimList";
import { MemoryToolbar, type View } from "./MemoryToolbar";
import { TierBar } from "./TierBar";
import "./memory.css";

const GraphView = lazy(() => import("./graph/GraphView"));
const PAGE = 100;
const MAX = 200; // the claims endpoint caps limit at 200

export function MemoryPage() {
  const [view, setView] = useState<View>("list");
  const [tier, setTier] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(false);

  const query = useClaims({ tier: tier === "all" ? undefined : tier, limit });
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = query.data ?? [];
    return q ? list.filter((c) => `${c.claim_text} ${c.segment} ${c.memory_class}`.toLowerCase().includes(q)) : list;
  }, [query.data, search]);

  return (
    <div className="mem">
      <AddMemoryDialog open={adding} onClose={() => setAdding(false)} />
      <MemoryToolbar view={view} onView={setView} tier={tier} onTier={(t) => { setTier(t); setLimit(PAGE); }} search={search} onSearch={setSearch} onAdd={() => setAdding(true)} />
      {view === "graph" ? (
        <div className="ab-card mem-body mem-graph">
          <Suspense fallback={<StateView kind="loading" title="Loading graph" style={{ height: "100%" }} />}>
            <GraphView tier={tier === "all" ? null : tier} search={search} />
          </Suspense>
        </div>
      ) : (
        <>
          <TierBar />
          <ClaimList
            query={query}
            rows={rows}
            onAdd={() => setAdding(true)}
            onClear={() => { setSearch(""); setTier("all"); }}
            onMore={(query.data?.length ?? 0) >= limit && limit < MAX ? () => setLimit((l) => Math.min(l + PAGE, MAX)) : undefined}
          />
        </>
      )}
    </div>
  );
}

/** Route component name kept for router.tsx. */
export { MemoryPage as MemoryPanel };
