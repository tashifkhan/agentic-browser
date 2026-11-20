import { useState } from "react";
import { Button } from "@agentic-browser/shared/ui";
import type { ImportMutation } from "./useMemoryImport";

const FIELDS = [
  { key: "linkedin", label: "LinkedIn summary or experience", placeholder: "Paste your summary, roles and skills", rows: 5 },
  { key: "google", label: "Profile or bio", placeholder: "Anything from your Google profile or a bio", rows: 3 },
  { key: "notes", label: "Notes", placeholder: "Anything else the agent should know about you", rows: 3 },
] as const;

/** Paste text about yourself; it is queued as profile sources. */
export function ManualEntry({ m }: { m: ImportMutation }) {
  const [v, setV] = useState({ linkedin: "", google: "", notes: "" });
  const empty = !v.linkedin.trim() && !v.google.trim() && !v.notes.trim();
  return (
    <section className="add__section">
      <h4>Write it yourself</h4>
      {FIELDS.map((f) => (
        <label key={f.key} className="add__field">
          <span>{f.label}</span>
          <textarea
            className="ab-input add__textarea"
            rows={f.rows}
            value={v[f.key]}
            placeholder={f.placeholder}
            onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))}
          />
        </label>
      ))}
      <div className="add__row add__row--end">
        <Button
          variant="primary"
          disabled={empty || m.isPending}
          loading={m.isPending && m.variables?.kind === "profile"}
          onClick={() => m.mutate({ kind: "profile", linkedin: v.linkedin.trim(), google: v.google.trim(), notes: v.notes.trim() }, { onSuccess: () => setV({ linkedin: "", google: "", notes: "" }) })}
        >
          Save
        </Button>
      </div>
    </section>
  );
}
