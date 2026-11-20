import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Sparkles, X, XCircle } from "../icons";
import {
  buildWorkLog, formatSpan, spanBetween, toolTitle,
  type AgentEvent, type ThinkingItem, type ToolItem, type WorkItem,
} from "../agent";

/**
 * What the agent did for one reply, in the order it did it: reasoning
 * summaries, tool calls (one row each, with status and duration), notes and
 * errors. Open while the run is live, collapsed to "Worked for 12s" after,
 * and left open when the run failed.
 */
export function WorkLog({ events, live = false, compact = false }: { events: AgentEvent[]; live?: boolean; compact?: boolean }) {
  const log = buildWorkLog(events, live);
  const [open, setOpen] = useState(live || log.status === "failed");
  const prev = useRef(log.status);
  useEffect(() => {
    if (prev.current === "running" && log.status === "done") setOpen(false);
    if (log.status === "failed") setOpen(true);
    prev.current = log.status;
  }, [log.status]);

  const now = useNow(log.status === "running");
  if (!log.items.length && log.status !== "running") return null;

  const elapsed = formatSpan(spanBetween(log.startedAt, log.endedAt ?? new Date(now).toISOString()));
  const lastItem = log.items[log.items.length - 1];
  const thinkingNow = log.status === "running" && lastItem?.kind === "thinking" && !lastItem.endedAt;
  const runningTool = log.status === "running" ? [...log.items].reverse().find((i): i is ToolItem => i.kind === "tool" && i.status === "running") : undefined;

  let title: ReactNode;
  if (log.status === "running") {
    title = thinkingNow ? "Thinking" : runningTool ? `${toolTitle(runningTool.tool)}` : "Working";
  } else if (log.status === "failed") {
    title = `Failed${elapsed ? ` after ${elapsed}` : ""}`;
  } else {
    title = `Worked${elapsed ? ` for ${elapsed}` : ""}`;
  }
  const count = log.toolCount ? `${log.toolCount} ${log.toolCount === 1 ? "step" : "steps"}` : "";

  return (
    <div className={`wl wl--${log.status}${compact ? " wl--compact" : ""}`}>
      <button type="button" className="wl__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="wl__status" aria-hidden="true">
          {log.status === "running" ? <span className="ab-spinner" /> : log.status === "failed" ? <XCircle size={14} /> : <Check size={14} strokeWidth={2.5} />}
        </span>
        <span className="wl__title">{title}</span>
        {log.status === "running" && elapsed && <span className="wl__meta">{elapsed}</span>}
        {count && <span className="wl__meta">{count}</span>}
        <ChevronRight size={13} className="wl__chev" />
      </button>
      {open && log.items.length > 0 && (
        <ol className="wl__body">
          {log.items.map((item) => (
            <Item key={item.id} item={item} live={log.status === "running"} now={now} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Item({ item, live, now }: { item: WorkItem; live: boolean; now: number }) {
  switch (item.kind) {
    case "thinking":
      return <Thought item={item} live={live && !item.endedAt} now={now} />;
    case "tool":
      return <ToolRow item={item} now={now} />;
    case "note":
      return (
        <li className="wl__item wl__note">
          <span className="wl__dot" aria-hidden="true" />
          <span>{item.text}</span>
        </li>
      );
    case "error":
      return (
        <li className="wl__item wl__error">
          <X size={13} aria-hidden="true" />
          <span>{item.text}</span>
        </li>
      );
  }
}

/** Reasoning summary. Live: the latest lines, scrolling. Done: "Thought for 4s", click to read. */
function Thought({ item, live, now }: { item: ThinkingItem; live: boolean; now: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [item.text, live]);
  const span = formatSpan(spanBetween(item.startedAt, item.endedAt ?? new Date(now).toISOString()));
  const showBody = live || open;
  return (
    <li className={`wl__item wl__thought${live ? " is-live" : ""}`}>
      <button type="button" className="wl__thought-head" onClick={() => !live && setOpen((o) => !o)} aria-expanded={live ? undefined : open} disabled={live}>
        <Sparkles size={13} aria-hidden="true" />
        <span>{live ? "Thinking" : `Thought${span ? ` for ${span}` : ""}`}</span>
        {!live && <ChevronRight size={12} className={`wl__chev-sm${open ? " is-open" : ""}`} />}
      </button>
      {showBody && (
        <div ref={box} className={`wl__thought-body${live ? " is-tail" : ""}`}>
          {renderThought(item.text)}
        </div>
      )}
    </li>
  );
}

/** Thought summaries use **Heading** lines; show those bold, the rest as text. */
function renderThought(text: string): ReactNode {
  return text.split(/\n{2,}|\n(?=\*\*)/).map((para, i) => {
    const heading = para.match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/);
    return heading ? (
      <p key={i}><strong>{heading[1]}</strong>{heading[2] ? ` ${heading[2].replace(/\*\*/g, "")}` : ""}</p>
    ) : (
      <p key={i}>{para.replace(/\*\*/g, "")}</p>
    );
  });
}

function ToolRow({ item, now }: { item: ToolItem; now: number }) {
  const [open, setOpen] = useState(false);
  const span = formatSpan(spanBetween(item.startedAt, item.endedAt ?? new Date(now).toISOString()));
  const hasDetail = item.args != null || item.result != null || !!item.error;
  return (
    <li className={`wl__item wl__tool is-${item.status}`}>
      <button type="button" className="wl__tool-head" onClick={() => hasDetail && setOpen((o) => !o)} aria-expanded={hasDetail ? open : undefined} disabled={!hasDetail}>
        <span className="wl__tool-icon" aria-hidden="true">
          {item.status === "running" ? <span className="ab-spinner" /> : item.status === "error" ? <X size={13} /> : <Check size={13} strokeWidth={2.5} />}
        </span>
        <span className="wl__tool-name">{toolTitle(item.tool)}</span>
        {item.summary && <span className="wl__tool-arg">{item.summary}</span>}
        {span && <span className="wl__meta">{span}</span>}
      </button>
      {open && (
        <div className="wl__detail ab-fade">
          {item.args != null && <Block label="Input" value={item.args} />}
          {item.error ? <Block label="Error" value={item.error} /> : item.result != null && <Block label="Output" value={item.result} />}
        </div>
      )}
    </li>
  );
}

function Block({ label, value }: { label: string; value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div className="wl__block">
      <span className="wl__block-label">{label}</span>
      <pre>{text.length > 4000 ? `${text.slice(0, 4000)}…` : text}</pre>
    </div>
  );
}

/** Re-render every second while `on`, for live timers. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}
