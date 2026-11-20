import type { ReactNode } from "react";
import { Copy } from "@agentic-browser/shared/icons";
import { clockTime } from "@agentic-browser/shared/format";
import { AppMark, Button } from "@agentic-browser/shared/ui";
import { Markdown } from "./Markdown";

/** An agent reply: optional steps above, prose, and hover actions below. */
export function AgentMessage({
  content,
  at,
  steps,
  streaming = false,
  actions,
}: {
  content: string;
  at?: string;
  steps?: ReactNode;
  streaming?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="msg msg--agent ab-rise">
      <div className="msg__head">
        <AppMark size={16} />
        <span className="msg__who">Agent</span>
        {at && !streaming && <time className="msg__time">{clockTime(at, false)}</time>}
      </div>
      {steps}
      <div className="msg__prose markdown-body">
        {content ? (
          <>
            <Markdown text={content} />
            {streaming && <span className="msg__caret" aria-hidden="true" />}
          </>
        ) : streaming ? (
          <div className="msg__thinking">
            <span className="msg__thinking-bar" />
            Working on it
          </div>
        ) : null}
      </div>
      {content && !streaming && (
        <div className="msg__actions">
          <Button variant="ghost" size="sm" icon={<Copy size={12} />} onClick={() => navigator.clipboard?.writeText(content)}>
            Copy
          </Button>
          {actions}
        </div>
      )}
    </div>
  );
}
