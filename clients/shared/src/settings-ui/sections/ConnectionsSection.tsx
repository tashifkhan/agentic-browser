import { useState } from "react";
import { Info, Link as LinkIcon } from "../../icons";
import { Button, IconButton } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { useApi } from "../../query/provider";
import type { ComposioConnection, IntegrationsStatus } from "../../types/api";
import { SettingsSection as Section, settingsInputStyle as inputStyle } from "../components";
import { Actions, MutationNote, SettingHead } from "../parts";
import { useSettingsMutation } from "../hooks";
import { ToolkitCard } from "./connections/ToolkitCard";
import { ComposioConfigModal, ComposioGuideModal, RenameModal, ToolkitToolsModal } from "./connections/modals";
import { SUGGESTED_TOOLKITS, isActive } from "./connections/util";

export function ConnectionsSection({
  status,
  config,
  defaultOpen,
}: {
  status: IntegrationsStatus["composio"];
  config: IntegrationsStatus["composio_config"];
  defaultOpen?: boolean;
}) {
  const { api } = useApi();
  const [modal, setModal] = useState<null | "config" | "guide">(null);
  const [renaming, setRenaming] = useState<ComposioConnection | null>(null);
  const [inspecting, setInspecting] = useState<{ slug: string; name: string } | null>(null);
  const [toolkit, setToolkit] = useState("");

  const connect = useSettingsMutation((slug: string) => api.composioConnect(slug), (d) => {
    if (d.redirect_url) window.open(d.redirect_url, "_blank");
    setToolkit("");
  });
  const disconnect = useSettingsMutation((id: string) => api.composioDisconnect(id));
  const resetCfg = useSettingsMutation(() => api.composioConfigClear());

  const badKey = /invalid api key/i.test(status.error || "");
  const toolkits = status.toolkits ?? [];
  const activeCount = toolkits.reduce((n, t) => n + t.connections.filter(isActive).length, 0);

  return (
    <Section
      title="Connected apps"
      icon={LinkIcon}
      defaultOpen={defaultOpen}
      description={status.configured ? `${activeCount} account${activeCount === 1 ? "" : "s"} connected` : undefined}
      aside={<Pill tone={badKey ? "err" : status.configured ? "ok" : "neutral"}>{badKey ? "invalid key" : status.configured ? "configured" : "not set"}</Pill>}
    >
      <div className="set-row">
        <SettingHead
          name="Composio"
          info={<IconButton size="sm" label="What is Composio?" onClick={() => setModal("guide")}><Info size={14} /></IconButton>}
          facts={config.api_key_masked || config.user_id ? [["key", config.api_key_masked ?? "-"], ["user", config.user_id ?? "-"]] : undefined}
        />
        <Actions>
          <Button size="sm" variant={status.configured ? "default" : "primary"} onClick={() => setModal("config")}>{status.configured ? "Configure" : "Set up"}</Button>
          {(config.api_key_source === "db" || config.user_id_source === "db") && (
            <Button size="sm" variant="danger" loading={resetCfg.isPending} onClick={() => resetCfg.mutate()}>Reset</Button>
          )}
        </Actions>
      </div>

      {!status.configured && !status.error && (
        <p className="set-muted" style={{ margin: "0 0 8px" }}>Add a Composio project key to connect Gmail, GitHub, Slack and other apps.</p>
      )}

      {status.error && (
        <div className="set-callout set-callout--err">
          {status.error}
          {badKey && <div>Get a project API key from platform.composio.dev/settings and paste it under Configure.</div>}
        </div>
      )}

      {status.configured && (
        <>
          <div className="set-toolkits">
            {toolkits.map((tk) => (
              <ToolkitCard
                key={tk.slug}
                toolkit={tk}
                connecting={connect.isPending && connect.variables === tk.slug}
                onConnect={() => connect.mutate(tk.slug)}
                onInspect={() => setInspecting({ slug: tk.slug, name: tk.display_name })}
                onRename={setRenaming}
                onDisconnect={(c) => disconnect.mutate(c.id!)}
              />
            ))}
          </div>
          <form className="set-add" onSubmit={(e) => { e.preventDefault(); if (toolkit.trim()) connect.mutate(toolkit.trim()); }}>
            <input value={toolkit} onChange={(e) => setToolkit(e.target.value)} placeholder="Connect another app, e.g. slack" list="ab-composio-suggestions" style={inputStyle} />
            <datalist id="ab-composio-suggestions">
              {SUGGESTED_TOOLKITS.map((s) => <option key={s} value={s} />)}
            </datalist>
            <Button variant="primary" type="submit" disabled={!toolkit.trim()} loading={connect.isPending && connect.variables === toolkit.trim()}>Connect</Button>
          </form>
          <div className="set-actions">
            <MutationNote m={connect} label="connection" />
            <MutationNote m={disconnect} />
          </div>
        </>
      )}

      {modal === "guide" && <ComposioGuideModal onClose={() => setModal(null)} />}
      {modal === "config" && <ComposioConfigModal config={config} onClose={() => setModal(null)} />}
      {renaming && <RenameModal connection={renaming} onClose={() => setRenaming(null)} />}
      {inspecting && <ToolkitToolsModal slug={inspecting.slug} name={inspecting.name} onClose={() => setInspecting(null)} />}
    </Section>
  );
}
