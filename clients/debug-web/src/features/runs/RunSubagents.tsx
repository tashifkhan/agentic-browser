import type { Subagent } from "@agentic-browser/shared/api";
import { MarkdownRenderer } from "@agentic-browser/shared/markdown";
import { StateView, StatusPill } from "@agentic-browser/shared/ui";
import { Bot } from "@agentic-browser/shared/icons";
import { parseResultText } from "./runText";

export function RunSubagents({ subagents }: { subagents: Subagent[] }) {
  if (subagents.length === 0) {
    return <StateView icon={<Bot size={18} />} title="No subagents" body="This run didn't hand work to any subagents." />;
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {subagents.map((s) => (
        <article key={s.subagent_run_id} className="pn-agent">
          <div className="pn-agent__head">
            <Bot size={15} color="var(--text-3)" />
            <span className="pn-agent__name">{s.name}</span>
            <StatusPill status={s.status} />
          </div>
          <div className="pn-agent__part">
            <span className="pn-agent__label">Task</span>
            {s.task}
          </div>
          {s.result && (
            <div className="pn-agent__part" style={{ color: "var(--text)" }}>
              <span className="pn-agent__label">Result</span>
              <MarkdownRenderer content={parseResultText(s.result)} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
