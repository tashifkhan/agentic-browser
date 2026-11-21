import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { Segmented } from "../../ui/Segmented";
import { useApi } from "../../query/provider";
import { queryKeys } from "../../query/keys";
import type { AntigravityRuntime, Runtime } from "../../types/api";
import { SettingsField as Field, settingsInputStyle as inputStyle } from "../components";
import { KeyList, SubHeading } from "../parts";

const SOURCES: { value: AntigravityRuntime["source"]; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "managed", label: "Download" },
  { value: "t3", label: "T3 Code's copy" },
  { value: "custom", label: "Custom path" },
];

/**
 * Antigravity extras: where the runtime comes from (download the latest from
 * Google, or reuse T3 Code's copy), updates, and Google login.
 */
export function AntigravityPanel({ rt, onSave }: { rt: Runtime; onSave: (u: Partial<Runtime>) => void }) {
  const { api, baseUrl } = useApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: queryKeys.antigravity(baseUrl), queryFn: api.antigravity });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: queryKeys.antigravity(baseUrl) });
    qc.invalidateQueries({ queryKey: queryKeys.runtimes(baseUrl) });
    qc.invalidateQueries({ queryKey: queryKeys.models(baseUrl) });
  };
  const install = useMutation({ mutationFn: api.antigravityInstall, onSuccess: refresh });
  const useT3 = useMutation({ mutationFn: api.antigravityUseT3Login, onSuccess: refresh });
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const login = useMutation({
    mutationFn: api.antigravityLogin,
    onSuccess: ({ url }) => {
      setLoginUrl(url);
      window.open(url, "_blank", "noopener");
    },
  });
  const finish = useMutation({
    mutationFn: () => api.antigravityLoginCode(code),
    onSuccess: () => {
      setLoginUrl(null);
      setCode("");
      refresh();
    },
  });

  const d = q.data;
  if (!d) return <p className="set-muted">{q.isError ? "Couldn't check the Antigravity runtime." : "Checking the runtime…"}</p>;
  const latest = d.latest?.version;
  const err = (install.error || login.error || finish.error || useT3.error) as Error | null;

  return (
    <div className="set-antigravity">
      <SubHeading>Runtime</SubHeading>
      <div className="set-row">
        <Segmented size="sm" label="Runtime source" value={d.source} options={SOURCES} onChange={(v) => onSave({ source: v })} />
      </div>
      <KeyList
        rows={[
          { key: "using", label: "Using", value: d.using ? <span className="ab-mono">{d.using.replace(/^\/Users\/[^/]+/, "~")}</span> : "nothing yet" },
          { key: "own", label: "Downloaded here", value: d.managed ? `v${d.managed.version}` : "no" },
          { key: "t3", label: "T3 Code's copy", value: d.t3 ? `v${d.t3.version}` : "not found" },
          { key: "latest", label: "Latest from Google", value: latest ? `v${latest}` : d.latest?.error ? "couldn't check" : "…" },
        ]}
      />
      <div className="set-actions">
        <Button size="sm" variant={!d.managed || d.update_available ? "primary" : "ghost"} loading={install.isPending} onClick={() => install.mutate()}>
          {!d.managed ? `Download v${latest ?? "latest"}` : d.update_available ? `Update to v${latest}` : "Check for updates"}
        </Button>
        {install.data && <span className="set-note">{install.data.updated === "yes" ? `Installed v${install.data.version}.` : `Already on v${install.data.version}.`}</span>}
      </div>
      {d.source === "custom" && (
        <p className="set-muted">Set the path in the Command field below.</p>
      )}

      <SubHeading>Google login</SubHeading>
      <div className="set-row">
        <Pill tone={d.logged_in ? "ok" : "warn"}>{d.logged_in ? "logged in" : "not logged in"}</Pill>
        <span className="set-muted ab-mono">{(rt.profile_dir || "").replace(/^\/Users\/[^/]+/, "~")}</span>
      </div>
      <div className="set-actions">
        <Button size="sm" loading={login.isPending} disabled={!d.using} onClick={() => login.mutate()}>
          Log in with Google
        </Button>
        {d.t3_profile && rt.profile_dir !== d.t3_profile && (
          <Button size="sm" variant="ghost" loading={useT3.isPending} onClick={() => useT3.mutate()}>
            Use T3 Code's login
          </Button>
        )}
      </div>
      {loginUrl && (
        <form className="set-grid" onSubmit={(e) => { e.preventDefault(); if (code) finish.mutate(); }}>
          <p className="set-muted" style={{ gridColumn: "1 / -1" }}>
            A Google sign-in tab opened (<a href={loginUrl} target="_blank" rel="noreferrer">open it again</a>). After you sign in,
            paste the code it shows, or the whole URL of the page you land on.
          </p>
          <Field label="Code">
            <input value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-code)" }} autoFocus />
          </Field>
          <div className="set-actions">
            <Button size="sm" variant="primary" type="submit" disabled={!code} loading={finish.isPending}>Finish login</Button>
          </div>
        </form>
      )}
      {d.t3_profile && rt.profile_dir === d.t3_profile && (
        <p className="set-muted">Sharing T3 Code's login. Both apps refresh the same token, which is fine unless both run a turn at the same moment.</p>
      )}
      {err && <p className="set-note set-note--err">{err.message}</p>}
    </div>
  );
}
