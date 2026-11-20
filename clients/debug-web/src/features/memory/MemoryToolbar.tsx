import { List, Network, Plus } from "@agentic-browser/shared/icons";
import { Button, SearchField, Segmented } from "@agentic-browser/shared/ui";
import { Dot } from "./Dot";
import { TIERS } from "./constants";

export type View = "list" | "graph";

export function MemoryToolbar({
  view,
  onView,
  tier,
  onTier,
  search,
  onSearch,
  onAdd,
}: {
  view: View;
  onView: (v: View) => void;
  tier: string;
  onTier: (t: string) => void;
  search: string;
  onSearch: (s: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="mem-toolbar">
      <Segmented<View>
        label="View"
        value={view}
        onChange={onView}
        options={[
          { value: "list", label: "List", icon: <List size={13} /> },
          { value: "graph", label: "Graph", icon: <Network size={13} /> },
        ]}
      />
      <Segmented<string>
        label="Tier"
        value={tier}
        onChange={onTier}
        options={[{ value: "all", label: "All" }, ...TIERS.map((t) => ({ value: t.id, label: t.label, icon: <Dot color={t.color} /> }))]}
      />
      <SearchField value={search} onChange={onSearch} placeholder="Search memories" width={280} />
      <Button variant="primary" icon={<Plus size={14} />} onClick={onAdd} className="mem-add">
        Add memory
      </Button>
    </div>
  );
}
