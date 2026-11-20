import { useState } from "react";
import { KeyRound } from "../../icons";
import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { useApi } from "../../query/provider";
import type { PyJIITPublic } from "../../types/api";
import { SettingsField as Field, SettingsModal as Modal, SettingsSection as Section, settingsInputStyle as inputStyle } from "../components";
import { Actions, MutationNote, SettingHead } from "../parts";
import { useSettingsMutation } from "../hooks";

export function PyJIITSection({ pyjiit }: { pyjiit: PyJIITPublic }) {
  const { api } = useApi();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const save = useSettingsMutation(
    () => api.pyjiitSet({ username: username || undefined, password: password || undefined }),
    () => {
      setEditing(false);
      setUsername("");
      setPassword("");
    },
  );
  const clear = useSettingsMutation(() => api.pyjiitClear());

  return (
    <Section title="JIIT portal" icon={KeyRound} aside={<Pill tone={pyjiit.configured ? "ok" : "neutral"}>{pyjiit.configured ? "configured" : "not set"}</Pill>}>
      <div className="set-row">
        <SettingHead name="Portal login" facts={[["user", pyjiit.username ?? "-"], ["password", pyjiit.password_masked ?? "-"]]} />
        <Actions>
          <Button size="sm" onClick={() => setEditing(true)}>{pyjiit.configured ? "Change" : "Add login"}</Button>
          {pyjiit.configured && <Button size="sm" variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}>Remove</Button>}
        </Actions>
      </div>
      {editing && (
        <Modal title="JIIT portal login" onClose={() => setEditing(false)}>
          <form className="set-form" onSubmit={(e) => { e.preventDefault(); if (username || password) save.mutate(); }}>
            <Field label="Enrolment number">
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={pyjiit.username || ""} style={inputStyle} autoFocus />
            </Field>
            <Field label="Password" hint="Leave a field blank to keep its current value.">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            </Field>
            <div className="set-actions set-actions--end">
              <MutationNote m={save} />
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!username && !password} loading={save.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </Section>
  );
}
