import { useState } from "react";
import { Check, Copy } from "@agentic-browser/shared/icons";

/** Monospace value that copies itself on click. */
export function CopyText({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pn-copy"
      title={label}
      onClick={() =>
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        })
      }
    >
      {value}
      {done ? <Check size={12} color="var(--ok)" /> : <Copy size={12} />}
    </button>
  );
}
