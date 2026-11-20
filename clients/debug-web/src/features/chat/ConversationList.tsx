import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "@agentic-browser/shared/icons";
import { useConversations } from "@agentic-browser/shared/query";
import { recencyBucket } from "@agentic-browser/shared/format";
import { Button, QueryView, SearchField, Skeleton } from "@agentic-browser/shared/ui";
import { ConversationItem } from "./ConversationItem";
import type { ConversationRow } from "./types";

const ORDER = ["Today", "Yesterday", "This week", "Older"] as const;

function group(list: ConversationRow[]) {
  const stamp = (c: ConversationRow) => new Date(c.updated_at ?? c.created_at).getTime();
  const sorted = [...list].sort((a, b) => stamp(b) - stamp(a));
  return ORDER.map((label) => [label, sorted.filter((c) => recencyBucket(c.updated_at ?? c.created_at) === label)] as const).filter(
    ([, items]) => items.length,
  );
}

export function ConversationList({ activeId }: { activeId?: string }) {
  const navigate = useNavigate();
  const query = useConversations();
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const list = (query.data ?? []) as ConversationRow[];
    const q = filter.trim().toLowerCase();
    return group(q ? list.filter((c) => (c.title || "").toLowerCase().includes(q)) : list);
  }, [query.data, filter]);

  return (
    <aside className="chat__list" aria-label="Conversations">
      <div className="chat__list-head">
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate({ to: "/chat" })} style={{ width: "100%" }}>
          New chat
        </Button>
        <SearchField value={filter} onChange={setFilter} placeholder="Filter conversations" width="100%" />
      </div>
      <div className="chat__list-body">
        <QueryView
          query={query}
          errorHint="The list comes from Postgres."
          skeleton={[70, 55, 80, 45, 65, 60].map((w, i) => (
            <div key={i} style={{ padding: "10px 12px" }}>
              <Skeleton width={`${w}%`} height={11} />
              <Skeleton width="30%" height={9} style={{ marginTop: 7 }} />
            </div>
          ))}
          empty={<p className="chat__list-empty">No conversations yet. Your chats show up here.</p>}
        >
          {() =>
            groups.length === 0 ? (
              <p className="chat__list-empty">Nothing matches "{filter}".</p>
            ) : (
              groups.map(([label, items]) => (
                <section key={label} className="chat__group">
                  <h4 className="chat__group-label">{label}</h4>
                  {items.map((c) => (
                    <ConversationItem key={c.conversation_id} conv={c} active={c.conversation_id === activeId} />
                  ))}
                </section>
              ))
            )
          }
        </QueryView>
      </div>
    </aside>
  );
}
