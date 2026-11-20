import { useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { useApi } from "../query/provider";
import type { SecretStatus } from "../types/api";
import { settingsInputStyle } from "./components";
import { useSettingsMutation } from "./hooks";

type MutationLike = { isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown };

/** Inline save state: saving, saved, or the error message. */
export function MutationNote({ m, label }: { m: MutationLike; label?: string }) {
  if (m.isPending) return <span className="set-note">Saving{label ? ` ${label}` : ""}…</span>;
  if (m.isError) {
    const msg = m.error instanceof Error ? m.error.message : String(m.error);
    return <span className="set-note set-note--err" title={msg}>{msg}</span>;
  }
  if (m.isSuccess) return <span className="set-note set-note--ok">Saved</span>;
  return null;
}

/** Name plus status pill, with a mono line of key/value facts underneath. */
export function SettingHead({ name, pill, facts, info }: { name: ReactNode; pill?: ReactNode; facts?: [string, ReactNode][]; info?: ReactNode }) {
  return (
    <div className="set-head">
      <div className="set-head__top">
        <strong>{name}</strong>
        {info}
        {pill}
      </div>
      {facts && facts.length > 0 && (
        <div className="set-facts">
          {facts.map(([k, v]) => (
            <span key={k}>
              <span className="set-facts__k">{k}</span> {v ?? "-"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="set-actions">{children}</div>;
}

const SOURCE_LABEL: Record<string, string> = { db: "saved here", env: "from env", unset: "not set" };

/** One API key: masked value, where it comes from, and edit/clear controls. */
export function SecretRow({ secret }: { secret: SecretStatus }) {
  const { api } = useApi();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const save = useSettingsMutation(() => api.secretSet(secret.name, value), () => {
    setEditing(false);
    setValue("");
  });
  const clear = useSettingsMutation(() => api.secretClear(secret.name));

  return (
    <div className="set-secret">
      <div className="set-secret__main">
        <span className="set-secret__name">{secret.name}</span>
        <Pill tone={secret.source === "unset" ? "neutral" : "ok"}>{SOURCE_LABEL[secret.source] ?? secret.source}</Pill>
        {secret.masked && <code className="set-secret__mask">{secret.masked}</code>}
      </div>
      {editing ? (
        <form
          className="set-secret__edit"
          onSubmit={(e) => {
            e.preventDefault();
            if (value) save.mutate();
          }}
        >
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`New ${secret.env_var}`} style={settingsInputStyle} autoFocus />
          <Button size="sm" variant="primary" type="submit" disabled={!value} loading={save.isPending}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <MutationNote m={save} />
        </form>
      ) : (
        <div className="set-secret__actions">
          <Button size="sm" onClick={() => setEditing(true)}>{secret.source === "unset" ? "Add" : "Replace"}</Button>
          {secret.db_set && (
            <Button size="sm" variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}>Clear</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function SecretList({ secrets }: { secrets: SecretStatus[] }) {
  return (
    <div className="set-secrets">
      {secrets.map((s) => (
        <SecretRow key={s.name} secret={s} />
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="set-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="set-toggle__track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <div className="set-sub">{children}</div>;
}

/** Plain list of name/value rows (services, tools, agents). */
export function KeyList({ rows }: { rows: { key: string; label: ReactNode; value: ReactNode }[] }) {
  return (
    <div className="set-list">
      {rows.map((r) => (
        <div key={r.key}>
          <span>{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
