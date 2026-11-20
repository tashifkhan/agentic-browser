import { useState } from "react";
import { Globe } from "../../icons";
import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { useApi } from "../../query/provider";
import type { IntegrationsStatus } from "../../types/api";
import { SettingsField as Field, SettingsModal as Modal, SettingsSection as Section, settingsInputStyle as inputStyle } from "../components";
import { Actions, MutationNote, SettingHead } from "../parts";
import { useSettingsMutation } from "../hooks";

export function SearchSection({ search }: { search: IntegrationsStatus["search"] }) {
  const { api } = useApi();
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const save = useSettingsMutation(() => api.secretSet("tavily_api_key", key), () => {
    setEditing(false);
    setKey("");
  });
  const clear = useSettingsMutation(() => api.secretClear("tavily_api_key"));

  return (
    <Section title="Web search" icon={Globe} aside={<Pill tone={search.configured ? "ok" : "err"}>{search.configured ? "configured" : "missing"}</Pill>}>
      <div className="set-row">
        <SettingHead
          name={search.provider ?? "Search provider"}
          facts={[["key", search.api_key_masked ?? "-"], ["source", search.api_key_source ?? "-"]]}
        />
        <Actions>
          <Button size="sm" onClick={() => setEditing(true)}>{search.configured ? "Replace key" : "Add key"}</Button>
          {search.api_key_source === "db" && <Button size="sm" variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}>Reset</Button>}
        </Actions>
      </div>
      {editing && (
        <Modal title="Search API key" onClose={() => setEditing(false)}>
          <form className="set-form" onSubmit={(e) => { e.preventDefault(); if (key) save.mutate(); }}>
            <Field label="API key" hint="Stored encrypted and used only by the search tool.">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} style={inputStyle} autoFocus />
            </Field>
            <div className="set-actions set-actions--end">
              <MutationNote m={save} />
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!key} loading={save.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </Section>
  );
}
