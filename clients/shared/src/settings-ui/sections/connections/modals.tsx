import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../ui/Button";
import { QueryView } from "../../../ui/QueryView";
import { Skeleton } from "../../../ui/Skeleton";
import { useApi } from "../../../query/provider";
import type { ComposioConfigPublic, ComposioConnection } from "../../../types/api";
import { SettingsField as Field, SettingsModal as Modal, settingsInputStyle as inputStyle } from "../../components";
import { MutationNote } from "../../parts";
import { useSettingsMutation } from "../../hooks";
import { connectionTitle } from "./util";

export function ComposioGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About Composio" onClose={onClose}>
      <p className="set-muted" style={{ marginTop: 0 }}>
        Composio connects the agent to 200+ apps such as Gmail, GitHub, Notion and Slack, and handles each app's sign-in.
      </p>
      <ol className="set-steps">
        <li>Create an account at <a href="https://composio.dev" target="_blank" rel="noreferrer">composio.dev</a>.</li>
        <li>Copy the project API key from <a href="https://platform.composio.dev/settings" target="_blank" rel="noreferrer">platform.composio.dev/settings</a>. The key on the Sessions page won't work.</li>
        <li>Choose Configure here and paste it. The user ID can be your email or any unique string.</li>
        <li>Connect toolkits below.</li>
      </ol>
    </Modal>
  );
}

export function ComposioConfigModal({ config, onClose }: { config: ComposioConfigPublic; onClose: () => void }) {
  const { api } = useApi();
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const save = useSettingsMutation(() => api.composioConfigSet({ api_key: apiKey || undefined, user_id: userId || undefined }), onClose);
  return (
    <Modal title="Composio" onClose={onClose}>
      <form className="set-form" onSubmit={(e) => { e.preventDefault(); if (apiKey || userId) save.mutate(); }}>
        <Field label="API key">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config.api_key_masked ?? "Project API key"} style={inputStyle} autoFocus />
        </Field>
        <Field label="User ID" hint="Leave a field blank to keep its current value.">
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={config.user_id ?? "you@example.com"} style={inputStyle} />
        </Field>
        <div className="set-actions set-actions--end">
          <MutationNote m={save} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!apiKey && !userId} loading={save.isPending}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

export function RenameModal({ connection, onClose }: { connection: ComposioConnection; onClose: () => void }) {
  const { api } = useApi();
  const [alias, setAlias] = useState(connection.alias || connection.account_label || "");
  const rename = useSettingsMutation(() => api.composioRenameConnection(connection.id!, alias.trim()), onClose);
  return (
    <Modal title={`Rename ${connectionTitle(connection)}`} onClose={onClose}>
      <form className="set-form" onSubmit={(e) => { e.preventDefault(); if (alias.trim()) rename.mutate(); }}>
        <Field label="Name">
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Work Gmail" style={inputStyle} autoFocus />
        </Field>
        <div className="set-actions set-actions--end">
          <MutationNote m={rename} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!alias.trim()} loading={rename.isPending}>Rename</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ToolkitToolsModal({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const { api, baseUrl } = useApi();
  const tools = useQuery({ queryKey: ["ab", baseUrl, "composio-tools", slug], queryFn: () => api.composioToolkitTools(slug), staleTime: 5 * 60_000 });
  return (
    <Modal title={`${name} tools`} onClose={onClose}>
      <div className="set-tools">
        <QueryView
          query={tools}
          skeleton={<div style={{ display: "grid", gap: 10, padding: 12 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={34} />)}</div>}
          isEmpty={(d) => !d.tools?.length}
          empty={<p className="set-muted" style={{ padding: 12 }}>This toolkit has no tools listed.</p>}
        >
          {(d) =>
            d.tools.map((t) => (
              <div key={t.slug} className="set-tool">
                <div className="set-tool__name">{t.name}</div>
                <code>{t.slug}</code>
                {t.description && <p>{t.description}</p>}
              </div>
            ))
          }
        </QueryView>
      </div>
    </Modal>
  );
}
