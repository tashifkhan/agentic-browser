import { Link } from "@tanstack/react-router";
import { Copy } from "@agentic-browser/shared/icons";
import { timeAgo } from "@agentic-browser/shared/format";
import { IconButton } from "@agentic-browser/shared/ui";
import type { ConversationRow } from "./types";

export function ConversationItem({ conv, active }: { conv: ConversationRow; active: boolean }) {
  return (
    <div className={`conv${active ? " is-active" : ""}`}>
      <Link to="/chat/$conversationId" params={{ conversationId: conv.conversation_id }} className="conv__main" aria-current={active ? "page" : undefined}>
        <span className="conv__title">{conv.title || "Untitled chat"}</span>
        <span className="conv__meta">
          {timeAgo(conv.updated_at ?? conv.created_at)}
          {conv.client_id && <span className="conv__client">{clientLabel(conv.client_id)}</span>}
        </span>
      </Link>
      <IconButton size="sm" label="Copy conversation ID" className="conv__action" onClick={() => navigator.clipboard?.writeText(conv.conversation_id)}>
        <Copy size={12} />
      </IconButton>
    </div>
  );
}

function clientLabel(id: string) {
  if (id.includes("extension")) return "extension";
  if (id.includes("debug")) return "console";
  return id;
}
