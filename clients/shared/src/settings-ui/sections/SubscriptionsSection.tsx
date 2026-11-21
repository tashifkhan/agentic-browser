import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Trash2 } from "../../icons";
import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { useApi } from "../../query/provider";
import { queryKeys } from "../../query/keys";
import type { Runtime, RuntimeTest } from "../../types/api";
import { SettingsField as Field, SettingsSection as Section, settingsInputStyle as inputStyle } from "../components";
import { SubHeading, Toggle } from "../parts";
import { AntigravityPanel } from "./AntigravityPanel";

const KIND_LABEL: Record<Runtime["kind"], string> = {
  "claude-sdk": "Claude Agent SDK",
  "codex-exec": "codex exec",
  acp: "Agent Client Protocol",
};

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** One runtime: on/off, where it lives, which models, and a Test button. */
function RuntimeCard({ rt }: { rt: Runtime }) {
  const { api, baseUrl } = useApi();
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: queryKeys.runtimes(baseUrl) });
    qc.invalidateQueries({ queryKey: queryKeys.models(baseUrl) });
    qc.invalidateQueries({ queryKey: queryKeys.antigravity(baseUrl) });
  };
  const [command, setCommand] = useState(rt.command);
  const [args, setArgs] = useState(rt.args.join(" "));
  const [models, setModels] = useState(rt.models.join(", "));
  const [profile, setProfile] = useState(rt.profile_dir ?? "");
  const [extra, setExtra] = useState(rt.extra_instructions ?? "");
  const [test, setTest] = useState<RuntimeTest | null>(null);

  useEffect(() => {
    setCommand(rt.command);
    setArgs(rt.args.join(" "));
    setModels(rt.models.join(", "));
    setProfile(rt.profile_dir ?? "");
    setExtra(rt.extra_instructions ?? "");
  }, [rt.command, rt.args.join(" "), rt.models.join(","), rt.profile_dir, rt.extra_instructions]);

  const save = useMutation({ mutationFn: (u: Partial<Runtime>) => api.runtimeSave(rt.id, u), onSuccess: refresh });
  const run = useMutation({ mutationFn: () => api.runtimeTest(rt.id), onSuccess: (r) => { setTest(r); refresh(); } });
  const remove = useMutation({ mutationFn: () => api.runtimeDelete(rt.id), onSuccess: refresh });

  const dirty =
    command !== rt.command ||
    args !== rt.args.join(" ") ||
    models !== rt.models.join(", ") ||
    profile !== (rt.profile_dir ?? "") ||
    extra !== (rt.extra_instructions ?? "");
  const tone = !rt.status.installed ? "warn" : rt.enabled ? "ok" : "neutral";

  return (
    <div className="set-runtime">
      <div className="set-row set-runtime__head">
        <Toggle checked={rt.enabled} onChange={(v) => save.mutate({ enabled: v })} label={<strong>{rt.label}</strong>} />
        <Pill tone={tone}>{!rt.status.installed ? "not found" : rt.enabled ? "on" : "off"}</Pill>
        <span className="set-muted">{KIND_LABEL[rt.kind]}</span>
      </div>
      {rt.status.note && <p className="set-note set-note--err">{rt.status.note}</p>}
      {rt.status.login && <p className="set-muted">{rt.status.login}</p>}

      {rt.id === "antigravity" && <AntigravityPanel rt={rt} onSave={(u) => save.mutate(u)} />}

      <div className="set-grid">
        {(rt.id !== "antigravity" || rt.source === "custom") && (
        <Field label={rt.kind === "claude-sdk" ? "Claude CLI path (empty: find on PATH)" : "Command"}>
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder={rt.status.path ?? ""} style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
        </Field>
        )}
        {rt.kind !== "claude-sdk" && (
          <Field label="Extra arguments">
            <input value={args} onChange={(e) => setArgs(e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
          </Field>
        )}
        {rt.id === "antigravity" && (
          <Field label="Profile folder (holds the Google login)">
            <input value={profile} onChange={(e) => setProfile(e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
          </Field>
        )}
        <Field label="Models in the picker (comma-separated; Test fills them in for ACP agents)">
          <input value={models} onChange={(e) => setModels(e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
        </Field>
        <Field label="Extra instructions for this runtime">
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Optional" style={inputStyle} />
        </Field>
      </div>
      <div className="set-row">
        <Toggle checked={rt.allow_web} onChange={(v) => save.mutate({ allow_web: v })} label="Let it use its own web search and fetch" />
      </div>
      <div className="set-actions">
        {dirty && (
          <Button
            size="sm"
            variant="primary"
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                command,
                args: args.split(/\s+/).filter(Boolean),
                models: list(models),
                ...(rt.id === "antigravity" ? { profile_dir: profile } : {}),
                extra_instructions: extra,
              })
            }
          >
            Save
          </Button>
        )}
        <Button size="sm" loading={run.isPending} disabled={!rt.status.installed} onClick={() => run.mutate()}>
          Test
        </Button>
        {!rt.builtin && (
          <Button size="sm" variant="danger" icon={<Trash2 size={13} />} loading={remove.isPending} onClick={() => remove.mutate()}>
            Remove
          </Button>
        )}
        {test && (
          <span className={test.ok ? "set-note" : "set-note set-note--err"}>
            {test.ok
              ? `Works: replied "${test.reply}" in ${test.seconds}s${test.models?.length ? `, ${test.models.length} models found` : ""}.`
              : `Failed after ${test.seconds}s: ${test.error}`}
          </span>
        )}
        {(save.error || run.error) && <span className="set-note set-note--err">{String((save.error || run.error) as Error)}</span>}
      </div>
    </div>
  );
}

/**
 * Use Claude, ChatGPT, Google AI and OpenCode plans in the agent. Each
 * runtime runs the chat turn itself with this app's browser and memory tools
 * (over MCP); pick it from the model menu like any other model.
 */
export function SubscriptionsSection({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { api, baseUrl } = useApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: queryKeys.runtimes(baseUrl), queryFn: api.runtimes });
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const add = useMutation({
    mutationFn: () => api.runtimeAdd({ label, command, args }),
    onSuccess: () => {
      setLabel("");
      setCommand("");
      setArgs("");
      qc.invalidateQueries({ queryKey: queryKeys.runtimes(baseUrl) });
      qc.invalidateQueries({ queryKey: queryKeys.models(baseUrl) });
    },
  });
  const on = q.data?.runtimes.filter((r) => r.enabled).length ?? 0;

  return (
    <Section
      title="Subscriptions"
      icon={Bot}
      defaultOpen={defaultOpen}
      description="Run the agent on your Claude, ChatGPT, Google AI or OpenCode plan"
      aside={q.data && <Pill tone={on ? "ok" : "neutral"}>{on} on</Pill>}
    >
      <p className="set-muted">
        Each one runs the chat turn as its own agent, logged in as you, with this app's browser and memory tools over
        MCP. It gets no shell and can't edit files. Turn one on, press Test, then pick it from the model menu. Memory
        extraction, chat titles and browser planning keep using the default model.
      </p>
      {q.isLoading && <p className="set-muted">Loading…</p>}
      {q.isError && <p className="set-note set-note--err">Couldn't load runtimes.</p>}
      {q.data?.runtimes.map((rt) => <RuntimeCard key={rt.id} rt={rt} />)}

      <SubHeading>Add an ACP agent</SubHeading>
      <p className="set-muted">Any command that speaks the Agent Client Protocol, e.g. <code>gemini --experimental-acp</code>.</p>
      <div className="set-grid">
        <Field label="Name">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Gemini CLI" style={inputStyle} />
        </Field>
        <Field label="Command">
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="gemini" style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
        </Field>
        <Field label="Arguments">
          <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="--experimental-acp" style={{ ...inputStyle, fontFamily: "var(--font-code)" }} />
        </Field>
      </div>
      <div className="set-actions">
        <Button size="sm" icon={<Plus size={13} />} disabled={!label || !command} loading={add.isPending} onClick={() => add.mutate()}>
          Add agent
        </Button>
        {add.error && <span className="set-note set-note--err">{String(add.error)}</span>}
      </div>
    </Section>
  );
}
