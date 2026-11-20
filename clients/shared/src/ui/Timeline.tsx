import { useState, type ReactNode } from "react";
import { ChevronRight } from "../icons";
import { clockTime } from "../format";

export type StepTone = "plan" | "act" | "ok" | "err";

export type TimelineStep = {
  id: string;
  kind: string;
  label: ReactNode;
  tone?: StepTone;
  at?: string | number | Date;
  live?: boolean;
  detail?: ReactNode;
};

/**
 * Vertical list of agent steps with a connecting rail. Used for run traces in
 * the console and for the agent's work log in the side panel.
 */
export function Timeline({ steps, dense = false }: { steps: TimelineStep[]; dense?: boolean }) {
  return (
    <ol className={`tl${dense ? " tl--dense" : ""}`}>
      {steps.map((s) => (
        <TimelineItem key={s.id} step={s} />
      ))}
    </ol>
  );
}

function TimelineItem({ step }: { step: TimelineStep }) {
  const [open, setOpen] = useState(false);
  const expandable = !!step.detail;
  return (
    <li className={`tl__step is-${step.tone ?? "plan"}${step.live ? " is-live" : ""}`}>
      <span className="tl__tick" aria-hidden="true" />
      <div className="tl__main">
        <button type="button" className="tl__row" onClick={() => expandable && setOpen((o) => !o)} aria-expanded={expandable ? open : undefined} disabled={!expandable}>
          <span className="tl__kind">{step.kind}</span>
          <span className="tl__label">{step.label}</span>
          {step.at && <time className="tl__time">{clockTime(step.at)}</time>}
          {expandable && <ChevronRight size={13} className={`tl__chev${open ? " is-open" : ""}`} />}
        </button>
        {open && <div className="tl__detail ab-fade">{step.detail}</div>}
      </div>
    </li>
  );
}

/** Map backend event types onto a short kind label and a tone. */
export function classifyEvent(type: string): { kind: string; tone: StepTone } {
  const t = type.toLowerCase();
  if (t.includes("error") || t === "failed") return { kind: "error", tone: "err" };
  if (t === "final" || t.endsWith("_result") || t === "quality_check" || t.endsWith("completed")) {
    return { kind: t === "final" ? "answer" : t === "quality_check" ? "check" : "result", tone: "ok" };
  }
  if (t.includes("tool_call") || t.startsWith("automation") || t === "browser_exec") return { kind: t.startsWith("automation") ? "browser" : "call", tone: "act" };
  if (t.includes("supervisor") || t === "run_started") return { kind: "plan", tone: "plan" };
  if (t.includes("subagent")) return { kind: "agent", tone: "plan" };
  return { kind: t.replace(/_/g, " ").slice(0, 8), tone: "plan" };
}
