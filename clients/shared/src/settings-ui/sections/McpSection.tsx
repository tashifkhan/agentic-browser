import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, RotateCw } from "../../icons";
import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { Segmented } from "../../ui/Segmented";
import { useApi } from "../../query/provider";
import { queryKeys } from "../../query/keys";
import type { McpSettings, McpStatus } from "../../types/api";
import { SettingsSection as Section } from "../components";
import { KeyList, SubHeading, Toggle } from "../parts";

const MODES: { value: McpSettings["browser_mode"]; label: string }[] = [
  { value: "all", label: "All four" },
  { value: "execute", label: "Code mode only" },
  { value: "plain", label: "No code mode" },
];

const same = (a: McpSettings, b: McpSettings) =>
  a.browser_tools === b.browser_tools && a.memory_tools === b.memory_tools && a.browser_mode === b.browser_mode;

/**
 * Which tools coding agents get over MCP. Changes are staged, then "Apply and
 * restart" saves them, rebuilds the tool list in every agentic-mcp process and
 * tells connected clients to re-list their tools.
 */
export function McpSection({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { api, baseUrl } = useApi();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: queryKeys.mcp(baseUrl), queryFn: api.mcpStatus, refetchInterval: 8_000 });
  const [draft, setDraft] = useState<McpSettings | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (status.data && !draft) setDraft(status.data.settings);
  }, [status.data, draft]);

  const done = (data: McpStatus, verb: string) => {
    qc.setQueryData(queryKeys.mcp(baseUrl), data);
    setDraft(data.settings);
    const told = data.notified_sessions ? `, ${data.notified_sessions} client${data.notified_sessions === 1 ? "" : "s"} refreshed` : "";
    setNote(`${verb}: ${data.enabled_tools.length} tools on${told}.`);
  };
  const apply = useMutation({ mutationFn: (s: McpSettings) => api.mcpSave(s), onSuccess: (d) => done(d, "Applied and restarted") });
  const restart = useMutation({ mutationFn: () => api.mcpRestart(), onSuccess: (d) => done(d, "Restarted") });

  const data = status.data;
  const saved = data?.settings;
  const dirty = Boolean(draft && saved && !same(draft, saved));
  const enabled = new Set(data?.enabled_tools ?? []);
  const set = (patch: Partial<McpSettings>) => {
    setNote(null);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const busy = apply.isPending || restart.isPending;
  const error = (apply.error || restart.error) as Error | null;

  return (
    <Section
      title="MCP server"
      icon={Plug}
      defaultOpen={defaultOpen}
      description="Tools that Claude Code, Codex, Cursor and other MCP clients get"
      aside={data && <Pill tone={enabled.size ? "ok" : "warn"}>{enabled.size} tools</Pill>}
    >
      {!draft || !data ? (
        <p className="set-muted">{status.isError ? "Couldn't reach the backend." : "Loading…"}</p>
      ) : (
        <>
          <div className="set-row">
            <Toggle checked={draft.browser_tools} onChange={(v) => set({ browser_tools: v })} label="Browser tools: tabs, snapshots, actions and code mode in your real browser" />
          </div>
          {draft.browser_tools && (
            <div className="set-row">
              <Segmented size="sm" label="Browser tools" value={draft.browser_mode} options={MODES} onChange={(v) => set({ browser_mode: v })} />
            </div>
          )}
          <div className="set-row">
            <Toggle checked={draft.memory_tools} onChange={(v) => set({ memory_tools: v })} label="Memory tools: recall, save and forget what the agent knows about you" />
          </div>
          {!draft.browser_tools && !draft.memory_tools && (
            <p className="set-note set-note--err">With both groups off, MCP clients get no tools.</p>
          )}

          <div className="set-actions">
            <Button
              size="sm"
              variant={dirty ? "primary" : "ghost"}
              icon={<RotateCw size={13} />}
              loading={busy}
              onClick={() => (dirty ? apply.mutate(draft) : restart.mutate())}
            >
              {dirty ? "Apply and restart MCP" : "Restart MCP"}
            </Button>
            {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(saved!)}>Discard</Button>}
            {note && !error && <span className="set-note">{note}</span>}
            {error && <span className="set-note set-note--err">{error.message}</span>}
          </div>

          <SubHeading>Live tools</SubHeading>
          <KeyList
            rows={[
              ...data.all_tools.browser.map((n) => ({ key: n, label: <span className="ab-mono">{n}</span>, value: <Pill tone={enabled.has(n) ? "ok" : "neutral"}>{enabled.has(n) ? "on" : "off"}</Pill> })),
              ...data.all_tools.memory.map((n) => ({ key: n, label: <span className="ab-mono">{n}</span>, value: <Pill tone={enabled.has(n) ? "ok" : "neutral"}>{enabled.has(n) ? "on" : "off"}</Pill> })),
            ]}
          />

          <SubHeading>Bridge</SubHeading>
          <KeyList
            rows={[
              { key: "role", label: "This backend", value: data.bridge.role === "host" ? "hosts the bridge" : "relays to another agentic-mcp" },
              { key: "url", label: "MCP over HTTP", value: <span className="ab-mono">{data.bridge.mcp_url}</span> },
              {
                key: "browsers",
                label: "Browsers attached",
                value: data.bridge.browsers.length
                  ? data.bridge.browsers.map((b) => `${b.browser ?? "browser"} ${b.version ?? ""}`.trim()).join(", ")
                  : "none",
              },
            ]}
          />
          <p className="set-muted">
            HTTP clients see changes right away. Agents that start <code>agentic-mcp</code> themselves (stdio) switch
            within a couple of seconds; clients that ignore tool-list updates show the new list after their next restart.
          </p>
        </>
      )}
    </Section>
  );
}
