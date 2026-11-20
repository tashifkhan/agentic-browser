import type { RunDetail } from "@agentic-browser/shared/api";
import { MarkdownRenderer } from "@agentic-browser/shared/markdown";
import { Pill } from "@agentic-browser/shared/ui";
import { fullTime } from "@agentic-browser/shared/format";
import { parseResultText } from "./runText";

/** The run's final answer, or its error. */
export function RunResult({ run }: { run: RunDetail }) {
  const text = parseResultText(run.error ?? run.final_answer);
  if (!text) return null;
  return (
    <section className={`pn-result${run.error ? " pn-result--error" : ""}`}>
      <div className="pn-result__head">
        <Pill tone={run.error ? "err" : "ok"} dot={false}>{run.error ? "error" : "answer"}</Pill>
        {run.completed_at && <span className="pn-dim" style={{ marginLeft: "auto" }}>{fullTime(run.completed_at)}</span>}
      </div>
      <div className="pn-result__body">
        <MarkdownRenderer content={text} />
      </div>
    </section>
  );
}
