import { useState } from "react";
import { Check, ChevronDown, X } from "@agentic-browser/shared/icons";
import { Timeline } from "@agentic-browser/shared/ui";
import { toTimeline, type StepEvent } from "./events";

/** Collapsible list of the agent's steps for one reply. */
export function StepsDisclosure({ steps, live = false, defaultOpen = false }: { steps: StepEvent[]; live?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!steps.length) return null;
  const last = steps[steps.length - 1];
  const failed = steps.some((s) => s.type.includes("error"));
  return (
    <div className="steps">
      <button type="button" className="steps__summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {live ? <span className="ab-spinner" /> : failed ? <X size={13} color="var(--err)" /> : <Check size={13} color="var(--ok)" />}
        <span className="steps__last">{last.label}</span>
        <span className="steps__count">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
        <ChevronDown size={13} className={`steps__chev${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className="steps__body ab-fade">
          <Timeline steps={toTimeline(steps, live)} dense />
        </div>
      )}
    </div>
  );
}
